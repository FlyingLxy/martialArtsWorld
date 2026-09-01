'use strict';
/* 存档层。上面的游戏逻辑不用关心底下是文件还是数据库。
 *
 *   不配 DB_HOST  → 存成 data.json（零依赖，本地和小服照旧这么玩）
 *   配了 DB_HOST  → 存进 MySQL（云上用，需要 npm i mysql2）
 *
 * 写入是「攒脏 + 批量提交」：谁变了标记谁，默认 2 秒合并写一次；
 * 涉及财产和关键节点的地方调 flush(true) 立刻落盘。
 */
const fs   = require('node:fs');
const path = require('node:path');

const FLUSH_MS = Number(process.env.FLUSH_MS || 2000);

let mode      = 'json';
let pool      = null;                       // MySQL 连接池
let FILE      = null;                       // JSON 模式的文件路径
let world     = null;                       // world 对象的引用，由 init 传进来
let dirtyP    = new Set();                  // 脏了的玩家名
let dirtyW    = false;                      // 世界数据（摊位/告示/影子）脏了
let timer     = null;
let flushing  = null;                       // 正在进行的 flush，避免并发重入
let RUNTIME   = [];                         // 不落盘的运行时字段

const cfg = () => ({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'paodian',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'paodian',
  connectionLimit: Number(process.env.DB_POOL || 5),
  charset: 'utf8mb4',
});

/* 把玩家对象里不该落盘的运行时字段剔掉 */
function plain(p){
  const o = {};
  for(const k in p) if(!RUNTIME.includes(k)) o[k] = p[k];
  return o;
}

/* ---------------- 建表 ---------------- */
const DDL = [
  `CREATE TABLE IF NOT EXISTS players (
     name       VARCHAR(32)  NOT NULL PRIMARY KEY,
     lv         INT          NOT NULL DEFAULT 1,
     gold       BIGINT       NOT NULL DEFAULT 0,
     sect       VARCHAR(16)  NULL,
     updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     data       JSON         NOT NULL,
     KEY idx_lv (lv DESC)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS world (
     k VARCHAR(32) NOT NULL PRIMARY KEY,
     v JSON        NOT NULL
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

/* ---------------- 对外接口 ---------------- */
const store = {

  get mode(){ return mode; },

  /* worldRef：server.js 里那个 world 对象；runtimeKeys：不落盘的字段名 */
  async init(worldRef, runtimeKeys, jsonFile){
    world   = worldRef;
    RUNTIME = runtimeKeys;
    FILE    = jsonFile;

    if(!process.env.DB_HOST){ mode = 'json'; return {mode, where: FILE}; }

    mode = 'mysql';
    let mysql;
    try{ mysql = require('mysql2/promise'); }
    catch(e){
      throw new Error('要连 MySQL 得先装驱动：npm install mysql2');
    }
    pool = mysql.createPool(cfg());
    try{
      const c = await pool.getConnection();
      for(const sql of DDL) await c.query(sql);
      c.release();
    }catch(e){
      // 连不上就直接不启动，别让人玩半天才发现没存上
      throw new Error('连不上 MySQL（' + cfg().host + ':' + cfg().port + '）：' + e.message);
    }
    return {mode, where: cfg().host + ':' + cfg().port + '/' + cfg().database};
  },

  /* 读回全部数据。返回 {players:{名字:对象}, market, mseq, board, bseq, shadows} 或 null */
  async loadAll(){
    if(mode === 'json') return loadJson();

    const [rows] = await pool.query('SELECT name, data FROM players');
    const players = {};
    for(const r of rows) players[r.name] = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;

    const [ws] = await pool.query('SELECT k, v FROM world');
    const w = {};
    for(const r of ws) w[r.k] = typeof r.v === 'string' ? JSON.parse(r.v) : r.v;

    if(!rows.length && FILE && fs.existsSync(FILE)){
      const old = loadJson();                       // 头一回连库：把老的 data.json 整个搬进来
      if(old && Object.keys(old.players).length){
        console.log('  检测到 data.json，正在迁进 MySQL……');
        for(const n in old.players){ dirtyP.add(n); }
        Object.assign(players, old.players);
        Object.assign(w, {market:old.market, board:old.board, shadows:old.shadows,
                          seq:{mseq:old.mseq, bseq:old.bseq}});
        dirtyW = true;
        // 直接写进去，省得等第一次 flush
        await writeMysql(players, {market:w.market, board:w.board, shadows:w.shadows,
                                   mseq:old.mseq, bseq:old.bseq}, Object.keys(old.players));
        console.log('  迁移完成：' + Object.keys(old.players).length + ' 名玩家');
        try{ fs.renameSync(FILE, FILE + '.migrated'); }catch(e){}
      }
    }
    return {
      players,
      market : w.market  || [],
      board  : w.board   || [],
      shadows: w.shadows || [],
      mseq   : (w.seq && w.seq.mseq) || 0,
      bseq   : (w.seq && w.seq.bseq) || 0,
    };
  },

  markPlayer(name){ dirtyP.add(name); schedule(); },
  markWorld(){ dirtyW = true; schedule(); },
  markAll(){
    for(const n of world.players.keys()) dirtyP.add(n);
    dirtyW = true; schedule();
  },

  /* immediate=true 时立刻写并等它写完（关服、财产变动用） */
  async flush(immediate){
    if(!immediate){ schedule(); return; }
    if(timer){ clearTimeout(timer); timer = null; }
    return doFlush();
  },

  async close(){
    if(timer){ clearTimeout(timer); timer = null; }
    await doFlush();
    if(pool){ await pool.end(); pool = null; }
  },

  /* 排行榜之类的直接问数据库要，不用把所有人读进内存 */
  async top(n = 10){
    if(mode === 'json') return null;
    const [rows] = await pool.query(
      'SELECT name, lv, sect FROM players ORDER BY lv DESC, gold DESC LIMIT ?', [n]);
    return rows;
  },
};

function schedule(){
  if(timer || flushing) return;
  timer = setTimeout(()=>{ timer = null; doFlush().catch(e=>console.error('！存档写失败：', e.message)); }, FLUSH_MS);
}

async function doFlush(){
  if(flushing) return flushing;                 // 已经在写了，等那一次
  if(!dirtyP.size && !dirtyW) return;
  const names = [...dirtyP]; dirtyP.clear();
  const wantWorld = dirtyW; dirtyW = false;

  flushing = (async () => {
    try{
      if(mode === 'json') writeJson();
      else await writeMysql(null, null, names, wantWorld);
    }catch(e){
      names.forEach(n=>dirtyP.add(n));          // 写失败就把脏标记还回去，下次再试
      if(wantWorld) dirtyW = true;
      throw e;
    }finally{ flushing = null; }
  })();
  return flushing;
}

/* ---------------- MySQL ---------------- */
async function writeMysql(playersOverride, worldOverride, names, wantWorld = true){
  const conn = await pool.getConnection();
  try{
    await conn.beginTransaction();
    for(const name of names){
      const p = playersOverride ? playersOverride[name] : world.players.get(name);
      if(!p) continue;
      const o = playersOverride ? p : plain(p);
      await conn.execute(
        `INSERT INTO players (name, lv, gold, sect, data) VALUES (?,?,?,?,CAST(? AS JSON))
         ON DUPLICATE KEY UPDATE lv=VALUES(lv), gold=VALUES(gold), sect=VALUES(sect), data=VALUES(data)`,
        [name, o.lv|0, o.gold|0, o.sect || null, JSON.stringify(o)]);
    }
    if(wantWorld){
      const src = worldOverride || world;
      const put = async (k, v) => conn.execute(
        'INSERT INTO world (k,v) VALUES (?,CAST(? AS JSON)) ON DUPLICATE KEY UPDATE v=VALUES(v)',
        [k, JSON.stringify(v)]);
      await put('market',  src.market  || []);
      await put('board',   src.board   || []);
      await put('shadows', src.shadows || []);
      await put('seq',     {mseq: src.mseq || 0, bseq: src.bseq || 0});
    }
    await conn.commit();
  }catch(e){
    try{ await conn.rollback(); }catch(_){}
    throw e;
  }finally{ conn.release(); }
}

/* ---------------- JSON（原来那套，原子写 + 备份） ---------------- */
function writeJson(){
  const players = {};
  for(const [n,p] of world.players) players[n] = plain(p);
  const blob = JSON.stringify({players, market:world.market, mseq:world.mseq,
                               board:world.board, bseq:world.bseq, shadows:world.shadows});
  const tmp = FILE + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  fs.writeSync(fd, blob);
  fs.fsyncSync(fd);                                   // 逼它真的落盘
  fs.closeSync(fd);
  if(fs.existsSync(FILE)) fs.copyFileSync(FILE, FILE + '.bak');
  fs.renameSync(tmp, FILE);                           // 原子替换
}
function loadJson(){
  for(const f of [FILE, FILE + '.bak']){
    if(!f || !fs.existsSync(f)) continue;
    try{
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      const players = j.players || j;                 // 兼容更早的格式
      if(f.endsWith('.bak')) console.log('！主存档坏了，从备份恢复');
      return {players, market:j.market||[], mseq:j.mseq||0,
              board:j.board||[], bseq:j.bseq||0, shadows:j.shadows||[]};
    }catch(e){
      console.error('！' + path.basename(f) + ' 读不了（' + e.message + '）' +
                    (f === FILE ? '，改用备份……' : ''));
    }
  }
  return null;
}

module.exports = store;

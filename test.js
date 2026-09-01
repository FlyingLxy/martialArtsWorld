'use strict';
/* 泡点江湖 · 主链自测
   跑法：node test.js
   会在临时目录里另起一个服务器（独立端口和存档），绝不碰正式的 data.json。 */

const http = require('node:http');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const D = require('./gamedata');
const { F, MAP, WEAPONS } = D;

const USE_MYSQL = process.argv[2] === 'mysql';
const DBENV = USE_MYSQL ? {
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: process.env.DB_PORT || '3307',
  DB_USER: process.env.DB_USER || 'paodian',
  DB_PASS: process.env.DB_PASS || 'paodian-dev',
  DB_NAME: process.env.DB_NAME || 'paodian',
} : {};

const PORT = 8199;
const H    = 'http://127.0.0.1:' + PORT;
const DIR  = fs.mkdtempSync(path.join(os.tmpdir(), 'paodian-test-'));
const SAVE = path.join(DIR, 'data.json');

/* ---------- 小测试框架 ---------- */
let pass = 0, fail = 0, group = '';
const G  = t => { group = t; console.log('\n' + t); };
const ok = (cond, msg, extra) => {
  if(cond){ pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '　实际：' + extra : '')); }
};
const near = (a, b, tol, msg) => ok(Math.abs(a-b) <= tol, msg, a);
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ---------- HTTP ---------- */
function post(p, body){
  return new Promise(res => {
    const d = JSON.stringify(body);
    const r = http.request(H+p, {method:'POST', headers:{'Content-Type':'application/json',
      'Content-Length':Buffer.byteLength(d)}},
      x => { let s=''; x.on('data',c=>s+=c); x.on('end',()=>{ try{ res(JSON.parse(s||'{}')); }catch(e){ res({}); } }); });
    r.on('error', ()=>res({}));
    r.write(d); r.end();
  });
}

/* ---------- 一个玩家 ---------- */
class Client {
  constructor(name, pass='x'){ this.name=name; this.pass=pass; this.state=null; this.logs=[]; }
  async login(create=true){
    const r = await post('/api/login', {name:this.name, pass:this.pass, create:create?1:0});
    this.token = r.token; return r;
  }
  connect(){
    return new Promise(res => {
      this.req = http.get(H+'/api/events?token='+this.token, x => {
        let buf = '';
        x.on('data', d => {
          buf += d;
          let i;
          while((i = buf.indexOf('\n\n')) >= 0){
            const line = buf.slice(0, i); buf = buf.slice(i+2);
            if(!line.startsWith('data: ')) continue;
            const m = JSON.parse(line.slice(6));
            if(m.t === 'state') this.state = m;
            else if(m.t === 'vitals' && this.state){
              const me = this.state.me;
              me.hp=m.hp; me.mp=m.mp; me.exp=m.exp; me.need=m.need; me.lv=m.lv;
              me.gold=m.gold; me.herb=m.herb; me.pot=m.pot;
              if(me.idle && m.acc !== null){ me.idle.acc = m.acc; me.idle.since = m.since; }
              if(this.state.battle){
                if(m.foeHp !== null) this.state.battle.foe.hp = m.foeHp;
                if(m.round !== null) this.state.battle.round = m.round;
                this.state.battle.wait = m.wait; this.state.battle.myTurn = m.myTurn;
              }
            }
            else if(m.t === 'log') this.logs.push(m.html.replace(/<[^>]+>/g, ''));
            else if(m.t === 'chat') this.logs.push('[chat]' + (m.text||'').replace(/<[^>]+>/g, ''));
          }
        });
        res();
      });
      this.req.on('error', ()=>res());
    });
  }
  cmd(c, args){ return post('/api/cmd', {token:this.token, cmd:c, args:args||{}}); }
  get me(){ return this.state && this.state.me; }
  get room(){ return this.state && this.state.room; }
  async until(pred, ms=12000, why='条件'){
    const t0 = Date.now();
    while(Date.now()-t0 < ms){ if(this.state && pred(this)) return true; await wait(120); }
    throw new Error('等不到：' + why);
  }
  said(kw){ return this.logs.some(l => l.includes(kw)); }
  clear(){ this.logs = []; }
  close(){ if(this.req) this.req.destroy(); }
}

/* ---------- 起服务器 ---------- */
let srv = null;
function boot(){
  return new Promise((res, rej) => {
    srv = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: {...process.env, PORT:String(PORT), DATA_FILE:SAVE, QUIET:'1',
            ...DBENV, ...(process.env.RL_ON ? {} : {NO_RATELIMIT:'1'}),
            ...(process.env.INV_ON ? {INVITE_CODE:'testcode'} : {})},
    });
    let out = '';
    srv.stdout.on('data', d => { out += d; if(out.includes('ready')) res(); });
    srv.stderr.on('data', d => process.stderr.write('  [服务器] ' + d));
    srv.on('exit', c => { if(c && c !== 0) rej(new Error('服务器退出，代码 ' + c)); });
    setTimeout(()=>rej(new Error('服务器起不来')), 8000);
  });
}
function down(){
  return new Promise(res => {
    if(!srv) return res();
    srv.once('exit', ()=>{ srv = null; res(); });
    srv.kill('SIGINT');                       // 走正常关服路径，会存档
    setTimeout(()=>{ if(srv){ srv.kill('SIGKILL'); srv=null; res(); } }, 3000);
  });
}
const readSave = () => JSON.parse(fs.readFileSync(SAVE, 'utf8'));

/* 预置一批不同等级的角色，省得测试里现练 */
function seed(){
  const crypto = require('node:crypto');
  const hash = s => crypto.createHash('sha256').update('paodian:'+s).digest('hex');
  const mk = (name, over) => {
    const p = {
      name, pass:hash('x'), lv:1, exp:0, sect:null, gangPts:0,
      str:5, root:5, mind:5, agi:5, pot:0, hp:0, mp:0, gold:50, herb:3,
      weapon:0, armor:0, skills:['pugong'], scene:'cunkou',
      wLv:0, aLv:0, bag:[], mats:{jing:0,xuan:0}, mail:[], quest:null,
      flowers:0, spouse:null, wedAt:0, treats:0, autoFight:true,
      kills:0, pkWin:0, pkLose:0, born:Date.now(), lastSeen:Date.now(), online:0,
      ...over,
    };
    p.hp = F.maxHp(p); p.mp = F.maxMp(p);
    return p;
  };
  const players = {
    老手: mk('老手', {lv:40, str:50, root:48, mind:46, agi:46, gold:500000, weapon:5, armor:4,
                     sect:'gaibang', gangPts:800, herb:50, mats:{jing:30, xuan:20}, scene:'guandao',
                     skills:['pugong','dagou','chanzi','xianglong','kanglong','shibazhang']}),
    对手: mk('对手', {lv:40, str:50, root:48, mind:46, agi:45, gold:500000, weapon:5, armor:4,
                     sect:'huashan', herb:50, scene:'leitai',
                     skills:['pugong','huashanjian','zixia','dugu']}),
    穷鬼: mk('穷鬼', {lv:8, str:12, root:12, mind:10, agi:10, gold:50, scene:'zhulin'}),
  };
  fs.writeFileSync(SAVE, JSON.stringify({players, market:[], mseq:0, board:[], bseq:0, shadows:[]}));
}

/* ================= 测试 ================= */
async function run(){

  G('① 登录与存档识别');
  {
    const a = new Client('新来的');
    const r1 = await a.login(false);
    ok(r1.isNew === true, '没见过的名号会先问一句，不闷声建号');
    const r2 = await a.login(true);
    ok(!!r2.token, '确认之后才真的建号');
    await a.connect(); await a.until(c=>c.me, 5000, '状态');
    ok(a.me.lv === 1 && a.me.gold === 50, '新角色 1 级 50 两');

    const bad = await post('/api/login', {name:'新来的', pass:'错的'});
    ok(bad.err === '暗号不对。', '暗号错直接拒绝');

    const again = await post('/api/login', {name:'新来的', pass:'x'});
    ok(!!again.token, '名号+暗号对上就读回同一个角色');
    a.close();
  }

  G('② 泡点：自动开始、按公式涨、打架停、打完接着泡');
  {
    const p = new Client('穷鬼');
    await p.login(); await p.connect();
    await p.until(c=>c.me, 5000, '状态');
    ok(!!p.me.idle, '一上线就自动开始修行，不用手点');
    ok(p.room.key === 'zhulin', '还在上次退出的地方');

    const e0 = p.me.exp;
    await wait(6500);
    const got = p.me.exp - e0;
    const per2s = F.idleTick(p.me, MAP.zhulin.paodian);
    near(got, per2s*3, per2s*1.5 + 1, `6 秒涨的经验对得上公式（约 ${(per2s*3).toFixed(1)}）`);

    await p.cmd('hunt');
    await p.until(c=>c.state.battle, 5000, '开打');
    ok(!p.me.idle, '打架时自动停下修行');
    await p.until(c=>!c.state.battle, 20000, '打完');
    await p.until(c=>!!c.me.idle, 5000, '恢复修行');
    ok(!!p.me.idle, '打完自动接着泡，不用再点一次');

    await p.cmd('idle'); await wait(400);
    ok(!p.me.idle, '主动收功能停下');
    await wait(2500);
    ok(!p.me.idle, '歇着的时候不会自作主张又开始');
    await p.cmd('go', {to:'cunkou'});
    await p.until(c=>c.room.key === 'cunkou', 5000, '换地方');
    ok(!!p.me.idle, '换个地方重新自动开始');
    p.close();
  }

  G('③ 打怪：掉银子、掉材料、掉装备进背包');
  {
    const h = new Client('老手');
    await h.login(); await h.connect();
    await h.until(c=>c.me, 5000, '状态');
    const g0 = h.me.gold, j0 = h.me.mats.jing;
    let kills = 0;
    for(let i=0; i<8; i++){
      if(h.me.hp < h.me.maxHp*0.4){ await h.cmd('herb'); await wait(300); }
      await h.cmd('hunt');
      try{ await h.until(c=>c.state.battle, 4000, '开打'); }catch(e){ continue; }
      await h.until(c=>!c.state.battle, 25000, '打完');
      kills++;
    }
    ok(kills >= 6, `连打 ${kills} 场都能正常结束`);
    ok(h.me.gold > g0, '打怪有银子进账');
    ok(h.me.mats.jing > j0, '打怪能搜出精铁');
    ok(h.me.bagN >= 0 && h.me.bagN <= h.me.bagMax, '行囊没有超出上限');
    h.close();
  }

  G('④ 打造：扣银子扣材料，材料不够要拦住');
  {
    const h = new Client('老手');
    await h.login(); await h.connect();
    await h.until(c=>c.me, 5000, '状态');
    await h.cmd('go', {to:'tiejiang'});
    await h.until(c=>c.room.key === 'tiejiang', 5000, '到铁匠铺');

    const g0 = h.me.gold, j0 = h.me.mats.jing, w0 = h.me.wLv;
    const cost = F.forgeCost(WEAPONS[h.me.wIdx].price, w0);
    const mat  = F.forgeMat(w0);
    h.clear();
    await h.cmd('forge', {kind:'w'});
    await wait(900);
    ok(h.me.gold === g0 - cost, `银子扣得对（${cost} 两）`, h.me.gold - g0);
    ok(h.me.mats.jing === j0 - mat.n, `材料扣得对（精铁 ×${mat.n}）`, h.me.mats.jing - j0);
    ok(h.me.wLv === w0 + 1 || h.said('白搭') || h.said('裂了'), '要么打成了，要么明确告诉你失败');

    // 把材料掏空，应当被拦住且不扣钱
    const before = {gold:h.me.gold, jing:h.me.mats.jing};
    let guard = 0;
    while(h.me.mats.jing > 0 && guard++ < 30){ await h.cmd('forge',{kind:'w'}); await wait(500); }
    h.clear();
    const g1 = h.me.gold;
    await h.cmd('forge', {kind:'w'});
    await wait(600);
    ok(h.me.gold === g1, '材料不够时不会白扣银子');
    ok(h.said('还须') || h.said('缺'), '材料不够会明说还差什么');
    h.close();
  }

  G('⑤ 钱货守恒：并发转账不透支、摆摊成交抽税');
  {
    const a = new Client('穷鬼'), b = new Client('对手');
    await a.login(); await b.login();
    await a.connect(); await b.connect();
    await a.until(c=>c.me, 5000, 'a'); await b.until(c=>c.me, 5000, 'b');
    await b.cmd('go', {to:a.room.key});
    await b.until(c=>c.room.key === a.room.key, 5000, '碰头');

    const a0 = a.me.gold, b0 = b.me.gold;
    await Promise.all(Array.from({length:12}, () => a.cmd('give', {name:'对手', n:20})));
    await wait(900);
    ok(a.me.gold >= 0, '并发转账不会把钱扣成负数', a.me.gold);
    ok(a.me.gold + b.me.gold === a0 + b0, '两人总额守恒，没凭空造钱',
       a.me.gold + b.me.gold - a0 - b0);

    // 摆摊 → 另一人买走 → 卖家收钱扣一成，抽头凭空消失
    const s = new Client('老手');
    await s.login(); await s.connect(); await s.until(c=>c.me, 5000, 's');
    await s.cmd('unequip', {kind:'w'}); await wait(400);
    await s.cmd('go', {to:'chengnei'});
    await s.until(c=>c.room.key === 'chengnei', 5000, '到长街');
    await s.cmd('stall', {i:0, price:10000}); await wait(600);
    ok((s.room.stalls||[]).length === 1, '东西摆上了摊');

    await b.cmd('go', {to:'chengnei'});
    await b.until(c=>c.room.key === 'chengnei', 5000, 'b 到长街');
    const sg0 = s.me.gold, bg0 = b.me.gold, id = b.room.stalls[0].id;
    await b.cmd('buystall', {id}); await wait(800);
    ok(b.me.gold === bg0 - 10000, '买家照标价付钱');
    ok(s.me.gold === sg0 + 9000, '卖家实收九成（一成抽头蒸发）', s.me.gold - sg0);
    ok(b.me.bagN > 0, '东西进了买家行囊');
    a.close(); b.close(); s.close();
  }

  G('⑥ 切磋：押注结算、围观席看得见');
  {
    const x = new Client('老手'), y = new Client('对手');
    await x.login(); await y.login();
    await x.connect(); await y.connect();
    await x.until(c=>c.me, 5000, 'x'); await y.until(c=>c.me, 5000, 'y');
    await x.cmd('go', {to:'leitai'}); await y.cmd('go', {to:'leitai'});
    await x.until(c=>c.room.key === 'leitai', 5000, 'x 到擂台');
    await y.until(c=>c.room.key === 'leitai', 5000, 'y 到擂台');

    const x0 = x.me.gold, y0 = y.me.gold, bet = 5000;
    x.clear(); y.clear();
    await x.cmd('pk', {name:'对手', bet});
    await y.until(c=>c.state.pending, 5000, '收到战书');
    ok(y.state.pending.type === 'pk' && y.state.pending.bet === bet, '战书带着赌注送到');
    await y.cmd('answer', {ok:1});
    await x.until(c=>!c.state.battle && c.me.pkWin + c.me.pkLose > 0, 45000, '打完');
    await wait(800);

    const dx = x.me.gold - x0, dy = y.me.gold - y0;
    ok(dx + dy < 0, '彩头被抽走一部分，总额是减少的', dx + dy);
    ok(Math.abs(dx + dy) === Math.floor(bet*2*D.PRICE.pkRake), '抽头正好是彩金的一成', Math.abs(dx+dy));
    ok(x.me.gold >= 0 && y.me.gold >= 0, '谁都没被扣成负数');
    ok(x.said('承让') || y.said('承让'), '围观席能看到胜负');
    x.close(); y.close();
  }

  G('⑦ 一个人也玩得下去：悬赏、告示、离线书信');
  {
    const h = new Client('老手');
    await h.login(); await h.connect(); await h.until(c=>c.me, 5000, '状态');
    await h.cmd('go', {to:'kezhan'});
    await h.until(c=>c.room.key === 'kezhan', 5000, '到客栈');

    if(h.me.quest) await h.cmd('turnin'), await wait(400);
    await h.cmd('quest'); await wait(600);
    ok(!!h.me.quest, '能从捕头那儿接到悬赏');
    ok(h.me.quest.need > 0 && !!h.me.quest.where, '悬赏写明了要几只、上哪儿找');

    h.clear();
    await h.cmd('post', {text:'测试用的告示'}); await wait(400);
    await h.cmd('board'); await wait(400);
    ok(h.said('测试用的告示'), '贴的告示留在了墙上');

    // 给一个不在线的人写信
    const off = new Client('离线的人');
    await off.login(true);                      // 只注册，不连线
    const g0 = h.me.gold;
    await h.cmd('sendmail', {to:'离线的人', text:'见字如面', gold:1000});
    await wait(500);
    ok(h.me.gold === g0 - 1000, '寄信时把随信的银子先扣掉');

    await off.connect(); await off.until(c=>c.me, 5000, '上线');
    off.clear();
    await off.cmd('mail'); await wait(600);
    ok(off.said('见字如面'), '不在线时寄的信，上线照样收得到');
    ok(off.me.gold >= 1000, '信里的银子也收到了');
    h.close(); off.close();
  }

  if(!USE_MYSQL){
    G('⑧ 邀请码与暗号加盐');
  {
    await down();
    process.env.INV_ON = '1';
    await boot();
    const noCode = await post('/api/login', {name:'路人甲', pass:'x', create:1});
    ok(noCode.err && noCode.needInvite, '没带邀请码，建不了新号');
    const wrong = await post('/api/login', {name:'路人甲', pass:'x', create:1, invite:'瞎猜的'});
    ok(!!wrong.err, '邀请码不对也不行');
    const right = await post('/api/login', {name:'路人甲', pass:'x', create:1, invite:'testcode'});
    ok(!!right.token, '码对了才建得成');

    // 老号（存档里是无盐的老格式）应当照常登录，并被就地升级成加盐
    const old = await post('/api/login', {name:'老手', pass:'x'});
    ok(!!old.token, '老账号不受邀请码影响，照常登录');
    await wait(2600);                        // 等一次存档落盘
    const saved = readSave();
    const rec = saved.players ? saved.players['老手'] : null;
    ok(rec && rec.salt && rec.salt.length === 32, '老账号的暗号已就地加盐（salt 长度 ' + (rec && rec.salt || '').length + '）');
    ok(rec && rec.pass !== require('node:crypto').createHash('sha256').update('paodian:x').digest('hex'),
       '存的不再是无盐 sha256 了');
    delete process.env.INV_ON;
    await down(); await boot();
  }

  G('⑨ 限流：公网上必须有这层');
  {
    // 单独起一个开着限流的服务器来验
    await down();
    process.env.RL_ON = '1';
    await boot();
    let ok429 = 0, okPass = 0;
    for(let i=0; i<16; i++){
      const r = await post('/api/login', {name:'压测'+i, pass:'x', create:1});
      if(r.err && r.err.includes('太频繁')) ok429++;
      else if(r.token || r.isNew) okPass++;
    }
    ok(okPass > 0, '正常的登录放行了（前 ' + okPass + ' 次）');
    ok(ok429 > 0, '连着刷到第 ' + (okPass+1) + ' 次就被挡了（挡掉 ' + ok429 + ' 次）');
    delete process.env.RL_ON;
    await down();
    await boot();
  }

  G('⑧ 存档：原子写、坏了能从备份救回来');
    await down();
    ok(fs.existsSync(SAVE), '关服时把存档落了盘');
    ok(fs.existsSync(SAVE + '.bak'), '同时留了一份备份');
    const good = readSave();
    ok(Object.keys(good.players).length >= 3, '存档里的角色都在');

    fs.writeFileSync(SAVE, fs.readFileSync(SAVE, 'utf8').slice(0, 200));   // 模拟断电写了半截
    await boot();
    const h = new Client('老手');
    await h.login(); await h.connect();
    await h.until(c=>c.me, 6000, '状态');
    ok(h.me.lv === 40, '主存档坏掉后，从备份把角色救了回来', h.me.lv);
    h.close();
  } else {
    G('⑧ 邀请码与暗号加盐');
  {
    await down();
    process.env.INV_ON = '1';
    await boot();
    const noCode = await post('/api/login', {name:'路人甲', pass:'x', create:1});
    ok(noCode.err && noCode.needInvite, '没带邀请码，建不了新号');
    const wrong = await post('/api/login', {name:'路人甲', pass:'x', create:1, invite:'瞎猜的'});
    ok(!!wrong.err, '邀请码不对也不行');
    const right = await post('/api/login', {name:'路人甲', pass:'x', create:1, invite:'testcode'});
    ok(!!right.token, '码对了才建得成');

    // 老号（存档里是无盐的老格式）应当照常登录，并被就地升级成加盐
    const old = await post('/api/login', {name:'老手', pass:'x'});
    ok(!!old.token, '老账号不受邀请码影响，照常登录');
    await wait(2600);                        // 等一次存档落盘
    const saved = readSave();
    const rec = saved.players ? saved.players['老手'] : null;
    ok(rec && rec.salt && rec.salt.length === 32, '老账号的暗号已就地加盐（salt 长度 ' + (rec && rec.salt || '').length + '）');
    ok(rec && rec.pass !== require('node:crypto').createHash('sha256').update('paodian:x').digest('hex'),
       '存的不再是无盐 sha256 了');
    delete process.env.INV_ON;
    await down(); await boot();
  }

  G('⑨ 限流：公网上必须有这层');
  {
    // 单独起一个开着限流的服务器来验
    await down();
    process.env.RL_ON = '1';
    await boot();
    let ok429 = 0, okPass = 0;
    for(let i=0; i<16; i++){
      const r = await post('/api/login', {name:'压测'+i, pass:'x', create:1});
      if(r.err && r.err.includes('太频繁')) ok429++;
      else if(r.token || r.isNew) okPass++;
    }
    ok(okPass > 0, '正常的登录放行了（前 ' + okPass + ' 次）');
    ok(ok429 > 0, '连着刷到第 ' + (okPass+1) + ' 次就被挡了（挡掉 ' + ok429 + ' 次）');
    delete process.env.RL_ON;
    await down();
    await boot();
  }

  G('⑧ 存档：MySQL 持久化');
    // 先记下改动前的家当，再正常关服重启，看数据在不在
    const a = new Client('老手');
    await a.login(); await a.connect(); await a.until(c=>c.me, 6000, '状态');
    await a.cmd('go', {to:'kezhan'}); await a.until(c=>c.room.key==='kezhan', 5000, '挪窝');
    const snap = {gold:a.me.gold, lv:a.me.lv, jing:a.me.mats.jing, scene:'kezhan'};
    a.close();
    await down();                       // 正常关服（会 flush 并 close 连接池）
    await boot();
    const b = new Client('老手');
    await b.login(); await b.connect(); await b.until(c=>c.me, 6000, '状态');
    ok(b.me.gold === snap.gold, '重启后银两分毫不差', b.me.gold - snap.gold);
    ok(b.me.lv === snap.lv, '重启后等级还在');
    ok(b.me.mats.jing === snap.jing, '重启后材料还在');
    ok(b.room.key === snap.scene, '重启后人还在原地');

    // 拔电源：不给它存档的机会
    const g0 = b.me.gold;
    await b.cmd('buy', {kind:'herb'});   // 花 30 两，立刻会被 sync 标脏
    await b.until(c=>c.me.gold === g0-30, 5000, '扣钱');
    await wait(2500);                    // 等一个 flush 周期
    b.close();
    srv.kill('SIGKILL'); srv = null;     // 直接砍掉，模拟断电
    await wait(600);
    await boot();
    const c2 = new Client('老手');
    await c2.login(); await c2.connect(); await c2.until(x=>x.me, 6000, '状态');
    ok(c2.me.gold === g0 - 30, 'kill -9 之后，已提交的那笔花销也还在', c2.me.gold - (g0-30));
    c2.close();

    // 库里确实有这些表和数据
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({host:DBENV.DB_HOST, port:Number(DBENV.DB_PORT),
      user:DBENV.DB_USER, password:DBENV.DB_PASS, database:DBENV.DB_NAME});
    const [[{n}]] = await conn.query('SELECT COUNT(*) AS n FROM players');
    ok(n >= 3, '库里 players 表有 ' + n + ' 行');
    const [rows] = await conn.query('SELECT lv, gold FROM players ORDER BY lv DESC LIMIT 1');
    ok(rows[0].lv === 40, 'lv 抽成了独立列，排行榜可以直接 SQL 排序');
    await conn.end();
  }
}

/* ================= 跑 ================= */
async function wipeMysql(){
  const mysql = require('mysql2/promise');
  const c = await mysql.createConnection({
    host:DBENV.DB_HOST, port:Number(DBENV.DB_PORT), user:DBENV.DB_USER,
    password:DBENV.DB_PASS, database:DBENV.DB_NAME});
  await c.query('DROP TABLE IF EXISTS players');
  await c.query('DROP TABLE IF EXISTS world');
  await c.end();
}

(async () => {
  console.log('泡点江湖 · 主链自测' + (USE_MYSQL ? '（MySQL 模式）' : '（本地文件模式）'));
  console.log('存档另放在 ' + SAVE + '，不碰正式的 data.json');
  seed();
  if(USE_MYSQL) await wipeMysql();      // 每次从干净的库开始，种子靠自动迁移导入
  await boot();
  let err = null;
  try{ await run(); }catch(e){ err = e; }
  await down();
  fs.rmSync(DIR, {recursive:true, force:true});

  console.log('\n' + '─'.repeat(46));
  if(err){ fail++; console.log('中途出错：' + err.message); }
  console.log(`通过 ${pass}　失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();

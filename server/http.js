/* 对外的三个接口（login / cmd / events）、限流、静态文件、开服收摊。 */

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const D = require('../gamedata');
const {SECTS,SKILLS,WEAPONS,ARMORS,MAP,MOBS,ARENA,GANG_FOE,EVENTS,ACTS,PRICE,MATS,DROP,F,titleOf,plus} = D;
const store = require('../store.js');
const {PORT, DATA, PUB, ROOT} = require('./config.js');
const {world, newPlayer, save, load, push, log, roomLog, chat, notice, hash, newSalt, checkPass} = require('./core.js');
const {sync, syncRoom} = require('./state.js');
const {CMD} = require('./commands.js');
const {autoIdle, stopIdle} = require('./idle.js');

/* 公网上什么人都有。没有这层，一个 for 循环就能刷爆注册、把流量费刷上天 */
const buckets = new Map();                       // key -> {n, until}
const RL_OFF = process.env.NO_RATELIMIT === '1'; // 自测时关掉，别让测试自己撞限流
function tooMany(key, max, windowMs){
  if(RL_OFF) return false;
  const now = Date.now();
  let b = buckets.get(key);
  if(!b || now > b.until){ b = {n:0, until: now + windowMs}; buckets.set(key, b); }
  return ++b.n > max;
}
setInterval(()=>{                                 // 定期清掉过期的桶，别让它无限涨
  const now = Date.now();
  for(const [k,b] of buckets) if(now > b.until) buckets.delete(k);
}, 60000);

/* 走了 nginx 之后要从头里取真实 IP，否则所有人看起来都是同一个来源 */
function clientIp(req){
  const xff = req.headers['x-forwarded-for'];
  if(xff) return String(xff).split(',')[0].trim();
  return (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}
const INVITE = (process.env.INVITE_CODE || '').trim();   // 空着就是不限制
const LIMITS = {
  login: {max: 10,  win: 60000},                  // 每分钟 10 次登录/注册
  cmd  : {max: 240, win: 60000},                  // 每分钟 240 条指令，正常玩远达不到
  sse  : {max: 20,  win: 60000},                  // 每分钟 20 次建连
};

const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
              '.css':'text/css; charset=utf-8','.ico':'image/x-icon'};
function body(req){
  return new Promise(res=>{ let b=''; req.on('data',c=>{ b+=c; if(b.length>4096) req.destroy(); });
                            req.on('end',()=>{ try{ res(JSON.parse(b||'{}')); }catch(e){ res({}); } }); });
}
const json = (res, o) => { res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(o)); };

let dataJs = null;                                // 拼好的前端数据包，只拼一次
const server = http.createServer(async (req, res)=>{
  const u = new URL(req.url, 'http://x');

  if(u.pathname === '/api/login'){
    if(tooMany('L:' + clientIp(req), LIMITS.login.max, LIMITS.login.win)){
      res.writeHead(429, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({err:'太频繁了，歇一分钟再试。'}));
    }
    const b = await body(req);
    const name = String(b.name||'').trim().slice(0,10), pass = String(b.pass||'');
    if(!name || !pass) return json(res,{err:'名号和暗号都不能空着。'});
    if(/[<>&"'\s]/.test(name)) return json(res,{err:'名号里不能有空格和奇怪符号。'});
    let p = world.players.get(name);
    if(p){ if(!checkPass(p, pass)) return json(res,{err:'暗号不对。'}); }
    else if(INVITE && String(b.invite||'').trim() !== INVITE){
      // 熟人局：新号得有邀请码，老号照常登录不受影响
      return json(res, {err:'邀请码不对。这是个熟人局，问问拉你来的人。', needInvite:true});
    }
    else if(!b.create){
      // 名号打错一个字就闷声建个新号，会让人以为存档丢了——先问一句
      return json(res, {isNew:true, name});
    }
    else { p = newPlayer(name, pass);
           p.salt = newSalt(); p.pass = hash(pass, p.salt);
           p.hp=F.maxHp(p); p.mp=F.maxMp(p); world.players.set(name,p);
           notice('<b>'+name+'</b> 初入江湖，落脚在杏花村。'); save(); }
    const token = crypto.randomBytes(16).toString('hex');
    world.tokens.set(token, name);
    return json(res, {token, name});
  }

  if(u.pathname === '/api/cmd'){
    if(tooMany('C:' + clientIp(req), LIMITS.cmd.max, LIMITS.cmd.win)){
      res.writeHead(429, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({err:'手别抖那么快。'}));
    }
    const b = await body(req);
    const name = world.tokens.get(b.token); const p = name && world.players.get(name);
    if(!p) return json(res,{err:'no-auth'});
    const fn = CMD[b.cmd];
    if(fn){ try{ fn(p, b.args||{}); }catch(e){ console.error('cmd '+b.cmd, e); } }
    return json(res, {ok:1});
  }

  if(u.pathname === '/api/events'){
    if(tooMany('E:' + clientIp(req), LIMITS.sse.max, LIMITS.sse.win)){
      res.writeHead(429); return res.end();
    }
    const name = world.tokens.get(u.searchParams.get('token'));
    const p = name && world.players.get(name);
    if(!p){ res.writeHead(401); return res.end(); }
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache',
                        'Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write('retry: 3000\n\n');
    if(p.clients.size >= 5){ res.writeHead(429); return res.end(); }   // 一个号最多 5 个窗口
    const first = p.clients.size === 0;
    p._lastFull = null; p._lastVit = null;      // 新连接进来，下一拍重发全量
    p.clients.add(res);
    req.on('close', ()=>{
      p.clients.delete(res); p.lastSeen = Date.now();
      if(p.clients.size===0){
        if(p.idle) stopIdle(p, true);
        roomLog(p.scene, '<span class="d">'+p.name+'的身影消失在人群里。</span>', p.name);
        syncRoom(p.scene); save();
      }
    });
    if(first){
      log(p, '<b class="g">【'+p.name+'　'+p.lv+'级　'+titleOf(p.lv)+'】</b>');
      log(p, '<span class="d">'+MAP[p.scene].desc+'</span>');
      const unread = p.mail.filter(m=>!m.read).length;
      if(unread) log(p, '<b class="p">✉ 有 '+unread+' 封信在等你（顶上「信箱」）。</b>');
      if(p.quest) log(p, '<span class="p">〖悬赏〗手上还有一桩：'+p.quest.name+' '+
                         p.quest.got+' / '+p.quest.need+'</span>');
      p.idleOff = false;
      autoIdle(p);
      roomLog(p.scene, '<span class="d">'+p.name+'来到了'+MAP[p.scene].name+'。</span>', p.name);
    }
    for(const m of world.chat.slice(-15)) push(p, m);
    sync(p); syncRoom(p.scene);
    return;
  }

  if(u.pathname === '/data.js'){
    // 把 gamedata/ 下的文件按序拼成一份给浏览器：剥掉只有 Node 用的那几行，
    // 拼完它们同处一个作用域，跨文件引用照样成立。前端还是只加载这一个 /data.js。
    if(!dataJs){
      dataJs = D.ORDER.map(f =>
        fs.readFileSync(path.join(ROOT, 'gamedata', f + '.js'), 'utf8')
          .split('\n').filter(l => !l.trimStart().startsWith('/*#node*/')).join('\n')
      ).join('\n');
    }
    res.writeHead(200, {'Content-Type':'text/javascript; charset=utf-8'});
    return res.end(dataJs);
  }

  // 静态
  let f = u.pathname === '/' ? '/index.html' : u.pathname;
  const file = path.join(PUB, path.normalize(f).replace(/^(\.\.[/\\])+/,''));
  fs.readFile(file, (e, buf)=>{
    if(e){ res.writeHead(404); return res.end('404'); }
    res.writeHead(200, {'Content-Type': MIME[path.extname(file)] || 'application/octet-stream'});
    res.end(buf);
  });
});

let byeing = false;
async function bye(sig){
  if(byeing) return; byeing = true;
  try{ await store.close(); }catch(e){ console.error('！关服存档失败：', e.message); }
  console.log('\n已存档，江湖再会。（' + sig + '）');
  process.exit(0);
}
process.on('SIGINT',  ()=>bye('Ctrl+C'));
process.on('SIGTERM', ()=>bye('SIGTERM'));
process.on('SIGHUP',  ()=>bye('终端关闭'));
process.on('uncaughtException', async e => {
  console.error('！出了个没接住的岔子：', e);
  try{ await store.close(); }catch(_){}                  // 崩之前先把命保住
  process.exit(1);
});

let bootInfo = null;
function listen(){ server.listen(PORT, ()=>{
  if(process.env.QUIET){ console.log('ready'); return; }        // 测试时别刷屏
  const nets = require('node:os').networkInterfaces();
  const lan = Object.values(nets).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log('\n  ╔══════════════════════════════════════════╗');
  console.log('  ║          泡 点 江 湖  已 开 服           ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('  本机：  http://localhost:' + PORT);
  for(const ip of lan) console.log('  同局域网的朋友： http://' + ip + ':' + PORT);
  console.log('  存档：  ' + (bootInfo ? bootInfo.where : DATA) +
              '（' + (bootInfo && bootInfo.mode === 'mysql' ? 'MySQL' : '本地文件') + '）');
  console.log('  Ctrl+C 存档并关服\n');
}); }

/* 先把存档读起来再开门，免得有人进来时数据还没就位 */
load().then(info => { bootInfo = info; listen(); })
      .catch(e => { console.error('\n！起不来：' + e.message + '\n'); process.exit(1); });

module.exports = { server, listen, bye };

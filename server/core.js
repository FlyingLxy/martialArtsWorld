/* 世界状态与基础设施：玩家对象、存档读写、SSE 推送、聊天频道。
   别的模块都依赖它，它不依赖任何人。 */

'use strict';
const crypto = require('node:crypto');
const D = require('../gamedata');
const {SECTS,SKILLS,WEAPONS,ARMORS,MAP,MOBS,ARENA,GANG_FOE,EVENTS,ACTS,PRICE,MATS,DROP,F,titleOf,plus} = D;
const store = require('../store.js');
const {DATA} = require('./config.js');

const world = {
  players: new Map(),      // name -> player
  tokens : new Map(),      // token -> name
  chat   : [],             // 最近聊天，供新登录者补看
  market : [],             // 寄卖摊位
  mseq   : 0,
  board  : [],             // 客栈墙上的告示，离线也看得见
  bseq   : 0,
  shadows: [],             // 擂台上留下的守擂影子，人不在也能打
  seq    : 0,
};
const rnd  = n => Math.floor(Math.random()*n);
const pick = a => a[rnd(a.length)];
const esc  = s => String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const hash = (s) => crypto.createHash('sha256').update('paodian:'+s).digest('hex');

function newPlayer(name, pass){
  return {
    name, pass:hash(pass), lv:1, exp:0, sect:null, gangPts:0,
    str:5, root:5, mind:5, agi:5, pot:0,
    hp:216, mp:88, gold:50, herb:3, weapon:0, armor:0,
    skills:['pugong'], scene:'cunkou',
    wLv:0, aLv:0,                     // 兵器、护体的打造等级
    bag:[], mats:{jing:0, xuan:0},    // 背包与打造材料
    mail:[], quest:null,              // 信箱、手上的悬赏
    flowers:0, spouse:null, wedAt:0, treats:0, autoFight:true,
    kills:0, pkWin:0, pkLose:0, born:Date.now(), lastSeen:Date.now(), online:0,
    // 运行时（不存盘）
    clients:new Set(), idle:null, battle:null, pending:null, buf:null,
  };
}
const RUNTIME = ['clients','idle','battle','pending','buf','_lastFull','_lastVit'];


/* 存档全交给 store：不配 DB_HOST 就写 data.json，配了就写 MySQL */
function save(immediate){
  store.markAll();
  return store.flush(!!immediate);
}
async function load(){
  const info = await store.init(world, RUNTIME, DATA);
  const data = await store.loadAll();
  if(!data){ console.log('全新的江湖，还没有人。'); return info; }

  world.market  = data.market  || [];
  world.board   = data.board   || [];
  world.shadows = data.shadows || [];
  world.mseq    = data.mseq || 0;
  world.bseq    = data.bseq || 0;
  for(const n in data.players){
    const p = Object.assign(newPlayer(n, 'x'), data.players[n]);
    p.clients = new Set(); p.idle = null; p.battle = null; p.pending = null; p.buf = null;
    if(!p.bag) p.bag = [];
    if(!p.mats) p.mats = {jing:0, xuan:0};
    if(!p.mail) p.mail = [];
    if(p.quest === undefined) p.quest = null;
    world.players.set(n, p);
  }
  console.log('已读入 ' + world.players.size + ' 名玩家' +
              (world.market.length ? '，' + world.market.length + ' 个摊位' : ''));
  return info;
}
function push(p, msg){
  const s = 'data: ' + JSON.stringify(msg) + '\n\n';
  for(const res of p.clients){ try{ res.write(s); }catch(e){} }
}
function online(){ return [...world.players.values()].filter(p=>p.clients.size>0); }
function inRoom(scene){ return online().filter(p=>p.scene===scene); }
function toRoom(scene, msg, except){
  for(const p of inRoom(scene)) if(!except || p.name!==except) push(p, msg);
}
function toAll(msg){ for(const p of online()) push(p, msg); }
function toSect(sect, msg){ for(const p of online()) if(p.sect===sect) push(p, msg); }

const log  = (p, html, cls) => push(p, {t:'log', scope:'me',  html, cls});
const roomLog = (scene, html, except) => toRoom(scene, {t:'log', scope:'pub', html, cls:'room'}, except);

function chat(from, ch, text, to){
  const m = {t:'chat', id:++world.seq, scope:(ch==='pm'?'me':'pub'), ch, from:from?from.name:null, lv:from?from.lv:0,
             sect:from&&from.sect?SECTS[from.sect].name:'', text:esc(text), ts:Date.now()};
  if(ch==='world'){ world.chat.push(m); if(world.chat.length>60) world.chat.shift(); toAll(m); }
  else if(ch==='room'){ m.place = MAP[from.scene].name; toRoom(from.scene, m); }
  else if(ch==='sect'){ if(!from.sect) return log(from,'<b>你无门无派，何来同门。</b>','warn');
                        m.place = SECTS[from.sect].name; toSect(from.sect, m); }
  else if(ch==='pm'){
    const tgt = world.players.get(to);
    if(!tgt || !tgt.clients.size) return log(from, '<b>江湖之大，一时寻不着「'+esc(to)+'」。</b>','warn');
    m.to = to; push(tgt, m); push(from, m);
  }
}
function notice(html){ const m={t:'chat', id:++world.seq, scope:'pub', ch:'sys', text:html, ts:Date.now()};
  world.chat.push(m); if(world.chat.length>60) world.chat.shift(); toAll(m); }

module.exports = { world, newPlayer, RUNTIME, save, load, push, online, inRoom, toRoom, toAll, toSect, log, roomLog, chat, notice, esc, hash, rnd, pick };

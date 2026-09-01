/* 泡点：自动开始、收功、每秒结算。这游戏的核心玩法。 */

'use strict';
const D = require('../gamedata');
const {SECTS,SKILLS,WEAPONS,ARMORS,MAP,MOBS,ARENA,GANG_FOE,EVENTS,ACTS,PRICE,MATS,DROP,F,titleOf,plus} = D;
const {world, save, push, online, log, roomLog} = require('./core.js');
const {sync, syncRoom} = require('./state.js');
const {gainExp, idleGain, fortune} = require('./growth.js');

function startIdle(p){
  const pd = MAP[p.scene].paodian;
  if(!pd) return log(p,'<b>此处不是修行之所。</b>','warn');
  if(p.battle) return log(p,'<b>你正在动手，静不下心。</b>','warn');
  if(p.lv < pd.lv) return log(p,'<b class="r">此处修行需 '+pd.lv+' 级以上，你火候未到。</b>');
  p.idle = {since:Date.now(), last:Date.now(), acc:0, frac:0};
  log(p, '<span class="b">你开始'+pd.act+'……</span>');
  log(p, '<span class="d">　'+pd.tip+'。挂着别动，经验自会涨；顺手在下面跟人聊聊天。</span>');
  roomLog(p.scene, '<span class="d">'+p.name+'开始'+pd.act+'。</span>', p.name);
  syncRoom(p.scene);
}
/* 到了能修行的地方就自己开始——站着不泡没有任何意义 */
function autoIdle(p){
  const pd = MAP[p.scene].paodian;
  if(!pd || p.idle || p.battle || p.idleOff || p.lv < pd.lv) return;
  p.idle = {since:Date.now(), last:Date.now(), acc:0, frac:0};
  log(p, '<span class="d">（你就地'+pd.act+'，经验开始涨了）</span>');
  syncRoom(p.scene);
}
function stopIdle(p, quiet){
  if(!p.idle) return;
  const t = Date.now()-p.idle.since, acc = p.idle.acc; p.idle = null;
  if(!quiet) log(p, '<span class="b">你收功起身，共修行 '+fmt(t)+'，得经验 <span class="n">'+acc+'</span>。</span>');
  syncRoom(p.scene);
}
function ago(ts){
  const s = Math.floor((Date.now()-ts)/1000);
  if(s < 60) return '刚刚';
  if(s < 3600) return Math.floor(s/60)+' 分钟前';
  if(s < 86400) return Math.floor(s/3600)+' 个时辰前';
  return Math.floor(s/86400)+' 天前';
}
function fmt(ms){
  const s = Math.floor(ms/1000);
  if(s<60) return s+'秒';
  if(s<3600) return Math.floor(s/60)+'分'+(s%60)+'秒';
  return Math.floor(s/3600)+'时'+Math.floor(s%3600/60)+'分';
}
setInterval(()=>{
  const now = Date.now();
  for(const p of online()){
    if(!p.idle || p.battle) continue;
    // 一次最多补 5 跳。机器卡顿、GC 停顿、磁盘阻塞都会让这个循环迟到，
    // 不封顶的话恢复那一刻会把攒下的几分钟一次性折成经验，白送一大截。
    const dt = Math.min(now - p.idle.last, 10000);
    if(dt < 2000) continue;
    p.idle.last = now - (dt % 2000);
    const wife = p.spouse && world.players.get(p.spouse);
    const together = wife && wife.clients.size && wife.scene === p.scene;
    const raw = idleGain(p, dt, together ? 1.1 : 1) + p.idle.frac;   // 零头攒着；夫妻同处多一成
    const got = Math.floor(raw);
    p.idle.frac = raw - got;
    if(got > 0){ p.idle.acc += got; gainExp(p, got, true); }
    p.mp = Math.min(F.maxMp(p), p.mp + Math.ceil(F.maxMp(p)*0.02));
    p.hp = Math.min(F.maxHp(p), p.hp + Math.ceil(F.maxHp(p)*0.01));
    if(Math.random() < 0.035) fortune(p);
  }
  for(const p of online()) sync(p);
}, 1000);
setInterval(()=>save(), 5*60*1000);   // 兜底，日常靠 sync 的增量标记
setInterval(()=>{ for(const p of online()) push(p, {t:'ping'}); }, 20000);

module.exports = { startIdle, autoIdle, stopIdle, ago, fmt };

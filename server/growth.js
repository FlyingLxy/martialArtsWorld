/* 成长：经验、升级、泡点收益换算、奇遇。 */

'use strict';
const D = require('../gamedata');
const {SECTS,SKILLS,WEAPONS,ARMORS,MAP,MOBS,ARENA,GANG_FOE,EVENTS,ACTS,PRICE,MATS,DROP,F,titleOf,plus} = D;
const {log, roomLog, notice, rnd, pick} = require('./core.js');

function gainExp(p, n, quiet){
  n = Math.max(1, Math.floor(n));
  p.exp += n;
  if(!quiet) log(p, '　获得经验 <span class="n">'+n+'</span>');
  let up = 0;
  while(p.exp >= F.need(p.lv)){
    p.exp -= F.need(p.lv); p.lv++; p.pot += 4; up++;
    p.hp = F.maxHp(p); p.mp = F.maxMp(p);
  }
  if(up){
    log(p, '<b class="g">★ 你的修为更进一层，现已是 '+p.lv+' 级（'+titleOf(p.lv)+'）！得潜能 '+(up*4)+' 点。</b>');
    roomLog(p.scene, '<span class="d">'+p.name+'周身气息一振，似是修为又进了一层。</span>', p.name);
    if(p.lv % 5 === 0) notice('<b>'+p.name+'</b> 修为精进，已至 <b>'+p.lv+'</b> 级，人称「'+titleOf(p.lv)+'」。');
    for(const k in SKILLS){
      const sk = SKILLS[k];
      if(sk.sect && p.sect===sk.sect && p.lv>=sk.lv && !p.skills.includes(k))
        log(p, '<span class="d">（回本门后山，'+SECTS[p.sect].master+'处已可参研《'+sk.name+'》）</span>');
    }
  }
}
function idleGain(p, ms, rate){
  const pd = MAP[p.scene].paodian; if(!pd) return 0;
  const ticks = Math.floor(ms/2000); if(ticks<=0) return 0;
  return F.idleTick(p, pd) * ticks * rate;   // 留小数，由调用方攒零头
}
function fortune(p){
  let r = rnd(100), acc = 0, e = EVENTS[0];
  for(const x of EVENTS){ acc += x.p; if(r < acc){ e = x; break; } }
  log(p, '<span class="p">〖奇遇〗'+e.txt+'</span>');
  if(e.t==='money'){ const g = 20+rnd(30*p.lv); p.gold += g; log(p,'　得银两 <span class="g">'+g+'</span>'); }
  if(e.t==='exp')  gainExp(p, F.need(p.lv)*0.08);
  if(e.t==='hurt'){ const d = Math.ceil(F.maxHp(p)*0.12); p.hp = Math.max(1,p.hp-d); log(p,'　<span class="r">损失气血 '+d+'</span>'); }
  if(e.t==='herb'){ p.herb++; log(p,'　得<span class="n">金疮药</span>一枚'); }
  if(e.t==='book'){ gainExp(p, F.need(p.lv)*0.3); p.pot++; log(p,'　<span class="g">潜能 +1</span>'); }
  if(e.t==='gaoren'){
    const k = pick(['str','root','mind','agi']); p[k]++;
    log(p,'　<span class="g">'+({str:'力量',root:'根骨',mind:'悟性',agi:'身法'})[k]+' +1</span>');
  }
}

module.exports = { gainExp, idleGain, fortune };

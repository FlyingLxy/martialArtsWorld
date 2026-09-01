/* 指令表。前端能触发的一切都在这儿注册，是前后端的接口清单。 */

'use strict';
const D = require('../gamedata');
const {SECTS,SKILLS,WEAPONS,ARMORS,MAP,MOBS,ARENA,GANG_FOE,EVENTS,ACTS,PRICE,MATS,DROP,F,titleOf,plus} = D;
const {world, push, online, toRoom, log, roomLog, chat, notice, rnd, pick} = require('./core.js');
const {sync, syncRoom} = require('./state.js');
const {startIdle, autoIdle, stopIdle} = require('./idle.js');
const {forge, treat, flower, propose, wedding, divorce, equip, unequip, dropIt, stall, unstall, buyStall} = require('./economy.js');
const {readBoard, postBoard, sendMail, readMail, takeQuest, turnQuest, leaveShadow} = require('./social.js');
const {startFight, turnPve, challenge, answer, turnPk, fightShadow} = require('./combat.js');

const CMD = {
  go(p, a){
    if(p.battle) return log(p,'<b>刀光剑影，脱不开身。</b>','warn');
    const to = MAP[a.to];
    if(!to || a.to === p.scene) return;
    if(to.sectOnly && !p.sect) return log(p,'<b class="r">你无门无派，山门弟子不放你进去。</b>');
    if(p.idle) stopIdle(p);
    const old = p.scene;
    roomLog(old, '<span class="d">'+p.name+'往'+to.name+'去了。</span>', p.name);
    p.scene = a.to;
    roomLog(p.scene, '<span class="d">'+p.name+'走了进来。</span>', p.name);
    log(p, '<b class="b">你来到'+to.name+'。</b>');
    log(p, '<span class="d">'+to.desc+'</span>');
    p.idleOff = false;                       // 换了地方，重新自动开始
    syncRoom(old); syncRoom(p.scene);
    autoIdle(p);
  },
  idle(p){
    if(p.idle){ p.idleOff = true; stopIdle(p); }
    else { p.idleOff = false; startIdle(p); }
  },
  hunt(p){
    const sc = MAP[p.scene]; if(!sc.hunt) return;
    const all = sc.hunt.map(k=>({...MOBS[k], key:k})).sort((a,b)=>a.lv-b.lv);
    const fit = all.filter(m => m.lv <= p.lv+4);          // 不让新手撞上越级怪
    startFight(p, pick(fit.length ? fit : [all[0]]));
  },
  arena(p, a){
    if(!MAP[p.scene].arena) return;
    const i = (a && a.i != null) ? (a.i|0) : -1;
    if(i >= 0){
      const foe = ARENA[i]; if(!foe) return;
      if(foe.lv > p.lv + 12) return log(p,'<b class="r">这等高手，你现下还惹不起。</b>');
      return startFight(p, foe, 'arena');
    }
    const list = ARENA.filter(x=>x.lv <= p.lv+3);
    if(!list.length) return log(p,'<span class="d">台上高手如云，你还是先练几年再来。</span>');
    startFight(p, list[list.length-1], 'arena');
  },
  gang(p){
    if(!MAP[p.scene].gang) return;
    if(!p.sect) return log(p,'<b class="r">你无门无派，何来械斗。</b>');
    const lv = Math.max(1, p.lv + rnd(6) - 3);
    startFight(p, {name:pick(GANG_FOE), lv, hp:Math.floor(80+lv*lv*4.6), atk:Math.floor(10+lv*5.8),
                   def:Math.floor(2+lv*2.3), exp:Math.floor(40+lv*lv*2.4), gold:Math.floor(20+lv*14)}, 'gang');
  },
  rest(p){
    if(p.battle) return;
    const h = Math.ceil(F.maxHp(p)*0.35), m = Math.ceil(F.maxMp(p)*0.35);
    p.hp = Math.min(F.maxHp(p), p.hp+h); p.mp = Math.min(F.maxMp(p), p.mp+m);
    log(p, '<span class="b">你盘膝而坐，运气周天，气血 +'+h+'，内力 +'+m+'。</span>');
    sync(p);
  },
  herb(p){
    if(p.herb<=0) return log(p,'<span class="d">身上已无金疮药了。</span>');
    p.herb--; const h = Math.ceil(F.maxHp(p)*0.5);
    p.hp = Math.min(F.maxHp(p), p.hp+h);
    log(p, '<span class="n">你服下金疮药，气血 +'+h+'。</span>'); sync(p);
  },
  pot(p, a){
    if(p.pot<=0 || !['str','root','mind','agi'].includes(a.k)) return;
    p.pot--; p[a.k]++;
    if(a.k==='root') p.hp += 14;
    if(a.k==='mind') p.mp += 10;
    sync(p);
  },
  join(p, a){
    if(!MAP[p.scene].joinsect) return;
    if(p.sect) return log(p,'<span class="d">你已是'+SECTS[p.sect].name+'门下，岂能改换门庭。</span>');
    if(p.lv < 3) return log(p,'<b class="r">各派掌门看你根基太浅，让你先历练到 3 级再来。</b>');
    const S = SECTS[a.sect]; if(!S) return;
    p.sect = a.sect;
    for(const k in S.bonus) p[k] += S.bonus[k];
    p.hp = F.maxHp(p); p.mp = F.maxMp(p);
    log(p, '<b class="g">★ 你三跪九叩，正式拜入'+S.name+'，'+S.master+'收你为徒。</b>');
    log(p, '<span class="d">　自此可上本门后山修行、参研本门武学，也能在门派频道跟同门说话。</span>');
    notice('<b>'+p.name+'</b> 拜入 <b>'+S.name+'</b> 门下。');
    sync(p); syncRoom(p.scene);
  },
  learn(p, a){
    if(!MAP[p.scene].learn || !p.sect) return;
    const sk = SKILLS[a.k];
    if(!sk || sk.sect!==p.sect || p.skills.includes(a.k)) return;
    if(p.lv<sk.lv) return log(p,'<b class="r">火候未到。</b>');
    if(sk.gang){
      if(p.gangPts < sk.gang) return log(p,'<b class="r">这是本门绝学，须 '+sk.gang+' 点帮贡才换得，你只有 '+p.gangPts+'。</b>');
      p.gangPts -= sk.gang;
    }else{
      if(p.gold<sk.cost) return log(p,'<b class="r">银两不足。</b>');
      p.gold -= sk.cost;
    }
    p.skills.push(a.k);
    if(sk.gang) notice('<b>'+p.name+'</b> 参透了'+SECTS[p.sect].name+'绝学《'+sk.name+'》。');
    log(p, '<b class="g">★ 你静心参研数日，终于练成《'+sk.name+'》！</b>');
    roomLog(p.scene, '<span class="d">'+p.name+'练成了《'+sk.name+'》。</span>', p.name);
    sync(p);
  },
  exchange(p){
    if(!MAP[p.scene].gang || p.gangPts < 60) return log(p,'<span class="d">帮贡不足（需 60），多打几场械斗罢。</span>');
    p.gangPts -= 60; p.pot += 3;
    log(p,'<span class="p">你以 60 帮贡换得门派赏赐，潜能 +3。</span>'); sync(p);
  },
  buy(p, a){
    const sc = MAP[p.scene]; if(!sc.shop) return;
    if(a.kind==='food'){
      if(p.gold<20) return log(p,'<b class="r">囊中羞涩。</b>');
      p.gold-=20; p.hp=F.maxHp(p); p.mp=F.maxMp(p);
      log(p,'<span class="n">酒足饭饱，气血内力尽复。</span>'); return sync(p);
    }
    if(a.kind==='herb'){
      if(p.gold<30) return log(p,'<b class="r">囊中羞涩。</b>');
      p.gold-=30; p.herb++; log(p,'<span class="n">买得金疮药一枚。</span>'); return sync(p);
    }
    const list = a.kind==='w' ? WEAPONS : ARMORS, it = list[a.i];
    if(!it || !it.price) return;
    const cheap = it.price<=1000;
    if(sc.shop==='smith' && !cheap) return log(p,'<span class="d">老铁匠摇头：这等神兵，得进城去寻。</span>');
    if(sc.shop==='city' && it.price<=220) return;
    if(p.gold < it.price) return log(p,'<b class="r">银两不足。</b>');
    p.gold -= it.price;
    if(a.kind==='w'){ p.weapon=a.i; log(p,'<b class="g">你买下'+it.name+'，掂了掂，甚是趁手。</b>'); }
    else { p.armor=a.i; log(p,'<b class="g">你换上'+it.name+'。</b>'); }
    if(it.price>=2200) roomLog(p.scene,'<span class="d">'+p.name+'买下了'+it.name+'。</span>', p.name);
    sync(p);
  },
  gamble(p){
    if(!MAP[p.scene].gamble) return;
    if(p.gold < 20) return log(p,'<span class="d">庄家瞥了你一眼：穷鬼，边儿去。</span>');
    const bet = Math.min(p.gold, Math.max(20, Math.floor(p.gold*0.2)));
    const d = [1+rnd(6),1+rnd(6),1+rnd(6)], sum = d[0]+d[1]+d[2], big = sum>=11, me = Math.random()<0.5;
    log(p,'<span class="d">你押了 '+bet+' 两在「'+(me?'大':'小')+'」上。骰盅开——'+d.join(' ')+' ＝ '+sum+'，'+(big?'大':'小')+'！</span>');
    if(me===big){ p.gold+=bet; log(p,'<b class="g">赢了 '+bet+' 两！</b>');
      if(bet>=500) roomLog(p.scene,'<span class="d">'+p.name+'一把赢了 '+bet+' 两，赌坊里一阵喧哗。</span>', p.name); }
    else { p.gold-=bet; log(p,'<b class="r">输了 '+bet+' 两。</b>'); }
    sync(p);
  },
  say(p, a){
    const text = String(a.text||'').slice(0,120).trim(); if(!text) return;
    if(text[0]==='/'){                      // /密语 名字 内容
      const m = text.match(/^\/(\S+)\s+([\s\S]+)$/);
      if(m) return chat(p, 'pm', m[2], m[1]);
      return log(p,'<span class="d">用法：/对方名字 要说的话</span>');
    }
    chat(p, a.ch||'world', text);
  },
  pk(p, a){ if(MAP[p.scene].pk || a.force) challenge(p, a.name, a.bet); else log(p,'<b>此处不便动手，去洛阳擂台罢。</b>','warn'); },
  strike(p, a){
    const B = p.battle; if(!B) return;
    if(B.kind==='pve' ? B.turn!=='me' : B.turn!==p.name) return;
    const sk = SKILLS[a.k];
    if(!sk || !p.skills.includes(a.k)) return;
    if(sk.mp > p.mp) return log(p,'<b class="r">内力不够使这一招。</b>');
    B.deadline = 0;
    if(B.kind==='pve') turnPve(p, sk); else turnPk(p, sk);
  },
  autofight(p){
    p.autoFight = !p.autoFight;
    log(p, p.autoFight ? '<span class="d">已改回自动应敌，看着就行。</span>'
                       : '<span class="b">改成自己出招了：每回合十秒内挑一招，逾时替你出默认的。</span>');
    const B = p.battle;
    if(B && p.autoFight && (B.kind==='pve' ? B.turn==='me' : B.turn===p.name)){
      B.deadline = 0;
      setTimeout(()=>{ if(p.battle===B) (B.kind==='pve' ? turnPve(p,null) : turnPk(p,null)); }, 300);
    }
    sync(p);
  },
  forge(p, a){ forge(p, a.kind==='a' ? 'a' : 'w'); },
  treat(p){ treat(p); },
  flower(p, a){ flower(p, a.name); },
  propose(p, a){ propose(p, a.name); },
  wedding(p){ wedding(p); },
  divorce(p){ divorce(p); },
  shadow(p){ leaveShadow(p); },
  fightshadow(p, a){ fightShadow(p, a.name); },
  board(p){ readBoard(p); },
  post(p, a){ if(MAP[p.scene].board) postBoard(p, a.text); else log(p,'<b>这儿没有告示板，去客栈或长街。</b>','warn'); },
  mail(p){ readMail(p); },
  sendmail(p, a){ sendMail(p, a.to, a.text, a.gold); },
  quest(p){ takeQuest(p); },
  turnin(p){ turnQuest(p); },
  equip(p, a){ equip(p, a.i|0); },
  unequip(p, a){ unequip(p, a.kind==='a'?'a':'w'); },
  dropit(p, a){ dropIt(p, a.i|0); },
  stall(p, a){ stall(p, a.i|0, a.price); },
  unstall(p, a){ unstall(p, a.id); },
  buystall(p, a){ buyStall(p, a.id); },
  answer(p, a){ answer(p, !!a.ok); },
  give(p, a){
    const t = world.players.get(a.name);
    if(!t || !t.clients.size || t.scene!==p.scene || t.name===p.name) return;
    const n = Math.min(p.gold, Math.max(1, parseInt(a.n)||0));   // 先夹住，绝不透支
    if(n <= 0) return log(p,'<b class="r">你身上一个子儿也没有了。</b>');
    p.gold -= n; t.gold += n;
    log(p,'<span class="g">你给了'+t.name+' '+n+' 两银子。</span>');
    log(t,'<b class="g">'+p.name+'塞给你 '+n+' 两银子。</b>');
    roomLog(p.scene,'<span class="d">'+p.name+'给了'+t.name+'一些银两。</span>', p.name);
    sync(p); sync(t);
  },
  act(p, a){
    const A = ACTS.find(x=>x.k===a.k); if(!A) return;
    const t = a.name && world.players.get(a.name);
    let s;
    if(t && t.clients.size && t.scene===p.scene && t.name!==p.name)
      s = A.duo.replace('{p}', p.name).replace('{t}', t.name);
    else s = A.solo.replace('{p}', p.name);
    toRoom(p.scene, {t:'log', scope:'pub', cls:'act', html:'<span class="act">＊ '+s+'</span>'});
  },
  who(p){
    const rows = online().sort((x,y)=>y.lv-x.lv).map(q =>
      q.name+'（'+q.lv+'级 '+titleOf(q.lv)+' · '+(q.sect?SECTS[q.sect].name:'无门无派')+'）　在'+MAP[q.scene].name);
    log(p, '<b>【江湖同道 '+rows.length+' 人】</b>\n'+rows.join('\n'));
  },
  look(p, a){
    const t = world.players.get(a.name); if(!t) return;
    log(p, '<b>【'+t.name+'】</b>'+titleOf(t.lv)+'　'+t.lv+'级　'+(t.sect?SECTS[t.sect].name:'无门无派')+
      (t.spouse?'　<span class="p">与'+t.spouse+'结缡</span>':'')+
      (t.flowers?'　收花 '+t.flowers+' 朵':'')+
      '\n　兵器：'+WEAPONS[t.weapon].name+plus(t.wLv)+'　护体：'+ARMORS[t.armor].name+plus(t.aLv)+
      '\n　武学：'+t.skills.map(k=>SKILLS[k].name).join('、')+
      '\n　战绩：胜 '+t.pkWin+' 负 '+t.pkLose+'　斩敌 '+t.kills);
  },
};

module.exports = { CMD };

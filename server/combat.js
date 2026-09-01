/* 战斗：招式效果结算、PvE、切磋、打影子。
   自动与手动出招都走这里，手动十秒不点会替玩家出默认招。 */

'use strict';
const D = require('../gamedata');
const {SECTS,SKILLS,WEAPONS,ARMORS,MAP,MOBS,ARENA,GANG_FOE,EVENTS,ACTS,PRICE,MATS,DROP,F,titleOf,plus} = D;
const {world, push, online, toRoom, log, roomLog, notice, rnd} = require('./core.js');
const {sync, syncRoom} = require('./state.js');
const {gainExp} = require('./growth.js');
const {autoIdle, stopIdle} = require('./idle.js');
const {answerWed} = require('./economy.js');
const {questKill, shadowResult} = require('./social.js');

/* 出手的人统一成这个样子：怪按固定值，玩家按属性算 */
const cAtk  = x => x.mob ? x.atk : F.atk(x);
const cDef  = x => x.mob ? x.def : F.def(x);
const cCrit = x => x.mob ? .05 : F.crit(x);
const cMaxHp= x => x.mob ? x.max : F.maxHp(x);
const cMaxMp= x => x.mob ? 999  : F.maxMp(x);
const cDodge= x => (x.mob ? .05 : F.dodge(x)) + (x.buf.dodge || 0);
const newBuf = () => ({guard:0, guardT:0, dodge:0, dodgeT:0, reflect:0, stunned:false});
const mkFoe = m => ({name:m.name, lv:m.lv, hp:m.hp, max:m.hp, atk:m.atk, def:m.def,
                     exp:m.exp, gold:m.gold, key:m.key, skills:m.skills, shadow:m.shadow,
                     mob:true, mp:999, buf:newBuf()});

// 挑一门能用的最狠的招（自动战斗、超时代打都用它）
function bestSkill(x){
  if(x.mob) return SKILLS.pugong;
  const ok = x.skills.map(k=>SKILLS[k]).filter(s=>s.mp <= x.mp);
  return ok.length ? ok.reduce((m,n)=> n.mult>m.mult ? n : m) : SKILLS.pugong;
}
const seeHp = x => Math.max(0, Math.floor(x.hp));

/* 一次出招，返回给围观者看的文字 */
function strike(A, D, sk, out){
  const e = sk.eff || {};
  if(!A.mob) A.mp = Math.max(0, A.mp - sk.mp);
  A.buf.reflect = e.reflect || 0;                 // 反弹只护这一轮
  if(e.guard){ A.buf.guard = e.guard; A.buf.guardT = e.turns || 1; }
  if(e.dodge){ A.buf.dodge = e.dodge; A.buf.dodgeT = e.turns || 1; }

  if(!e.sure && Math.random() < cDodge(D)){
    out.push('　'+A.name+sk.txt+'，<span class="b">'+D.name+'一晃身让了开去。</span>');
    return;
  }
  const hit = (again) => {
    const def = cDef(D) * (1 - (e.pierce || 0));
    let dmg = Math.max(1, Math.floor((cAtk(A)*sk.mult - def) * (0.85+Math.random()*0.3)));
    const crit = Math.random() < cCrit(A) + (e.crit || 0);
    if(crit) dmg = Math.floor(dmg * 1.8);
    if(D.buf.guardT > 0) dmg = Math.floor(dmg * (1 - D.buf.guard));
    D.hp -= dmg;
    out.push('　'+A.name+(again?'招式未老，又是一记':sk.txt)+'，'+(crit?'<span class="g">正中要害！</span>':'')+
             '<span class="d">'+D.name+'受创 </span><span class="r">'+dmg+'</span>'+
             (D.buf.guardT>0 ? '<span class="d">（护体挡去大半）</span>' : ''));
    if(e.drain){
      const h = Math.ceil(dmg * e.drain);
      A.hp = Math.min(cMaxHp(A), A.hp + h);
      out.push('　<span class="p">　'+A.name+'吸走 '+h+' 点补了自己。</span>');
    }
    return dmg;
  };
  hit(false);
  if(e.double && D.hp > 0 && Math.random() < e.double) hit(true);

  if(e.heal){ const h = Math.ceil(cMaxHp(A)*e.heal); A.hp = Math.min(cMaxHp(A), A.hp+h);
              out.push('　<span class="n">　'+A.name+'气血回了 '+h+'。</span>'); }
  if(e.mp && !A.mob){ const m = Math.ceil(cMaxMp(A)*e.mp); A.mp = Math.min(cMaxMp(A), A.mp+m);
              out.push('　<span class="b">　'+A.name+'内力涨了 '+m+'。</span>'); }
  if(e.stun && D.hp > 0 && Math.random() < e.stun){
    D.buf.stunned = true;
    out.push('　<span class="p">　'+D.name+'被震得气血翻涌，下一招使不出来了！</span>');
  }
}

/* 挨打之后的反弹 */
function bounce(A, D, dmg, out){
  if(!D.buf.reflect || dmg <= 0) return;
  const back = Math.ceil(dmg * D.buf.reflect);
  A.hp -= back;
  out.push('　<span class="p">　'+D.name+'借力打力，卸回去 '+back+' 点。</span>');
}
function tickBuf(x){
  if(x.buf.guardT > 0 && --x.buf.guardT === 0) x.buf.guard = 0;
  if(x.buf.dodgeT > 0 && --x.buf.dodgeT === 0) x.buf.dodge = 0;
}

/* ---- 开打 ---- */
function startFight(p, m, tag){
  if(p.battle) return log(p,'<b>你正在恶斗，无暇他顾。</b>','warn');
  if(p.idle) stopIdle(p, true);
  if(p.hp < F.maxHp(p)*0.15) return log(p,'<b class="r">你伤重未愈，此时动手怕是要送命，先打坐疗伤罢。</b>');
  p.buf = newBuf();
  p.battle = {kind:'pve', foe:mkFoe(m), tag, round:0, turn:'me', deadline:0};
  log(p, '<span class="r">〖遭遇〗'+m.name+'（'+m.lv+'级）拦住去路，一场恶斗在所难免！</span>');
  roomLog(p.scene, '<span class="d">'+p.name+'与'+m.name+'交上了手。</span>', p.name);
  step(p);
}

/* 轮到谁了：自动就替他出手，手动就等他点招（10 秒不点替他出默认招） */
function step(p){
  const B = p.battle; if(!B) return;
  if(B.turn === 'me' && !p.autoFight){
    B.deadline = Date.now() + 10000;
    sync(p);
    return;                     // 等 CMD.strike，或让 sweeper 超时代打
  }
  B.deadline = 0; sync(p);
  setTimeout(()=>{ if(p.battle === B) turnPve(p, B.turn === 'me' ? bestSkill(p) : null); },
             B.turn === 'me' ? 500 : 700);
}
function turnPve(p, sk){
  const B = p.battle; if(!B) return;
  const foe = B.foe, out = [];
  if(B.turn === 'me'){
    B.round++;
    if(B.round > 60){ log(p,'<span class="d">缠斗良久，双方各自罢手。</span>'); p.battle=null; return sync(p); }
    if(p.buf.stunned){ p.buf.stunned = false; out.push('　<span class="d">你被震得手脚发麻，这一招没使出来。</span>'); }
    else strike(p, foe, sk || bestSkill(p), out);
    const before = foe.hp;
    out.forEach(h=>log(p,h));
    if(foe.hp <= 0){ tickBuf(p); return endPve(p, true); }
    B.turn = 'foe';
  }else{
    if(foe.buf.stunned){ foe.buf.stunned = false; log(p,'　<span class="d">'+foe.name+'还没缓过来。</span>'); }
    else{
      const hp0 = p.hp;
      const fsk = foe.skills && foe.skills.length
        ? foe.skills.map(k=>SKILLS[k]).filter(Boolean).reduce((a,b)=> b.mult>a.mult ? b : a, SKILLS.pugong)
        : SKILLS.pugong;
      strike(foe, p, fsk, out);
      out.forEach(h=>log(p,h));
      const took = hp0 - p.hp;
      const back = [];
      bounce(foe, p, took, back);
      back.forEach(h=>log(p,h));
      if(foe.hp <= 0){ tickBuf(p); return endPve(p, true); }
    }
    if(p.hp <= 0){ p.hp = 0; return endPve(p, false); }
    tickBuf(p); tickBuf(foe);
    B.turn = 'me';
  }
  step(p);
}
function endPve(p, win){
  const B = p.battle, f = B.foe; p.battle = null; p.buf = newBuf();
  if(win){
    p.kills++;
    const g = Math.floor(f.gold*(0.7+Math.random()*0.6)); p.gold += g;
    log(p, '<b class="g">★ '+f.name+'倒地不起，你赢了！</b>');
    log(p, '　搜得银两 <span class="g">'+g+'</span>');
    gainExp(p, f.exp);
    if(B.tag==='gang'){ const pts = 5+rnd(10); p.gangPts += pts; log(p,'　帮贡 <span class="p">+'+pts+'</span>'); }
    if(Math.random()<0.15){ p.herb++; log(p,'　拾得<span class="n">金疮药</span>一枚'); }
    loot(p, f.lv);
    if(f.key) questKill(p, f.key);
    roomLog(p.scene, '<span class="d">'+p.name+'击倒了'+f.name+'。</span>', p.name);
    if(f.shadow) shadowResult(p, f, true);
    if(B.tag==='arena' && f.lv>=32) notice('<b>'+p.name+'</b> 在洛阳擂台上力克 <b>'+f.name+'</b>，满堂喝彩！');
  }else{
    if(f.shadow) shadowResult(p, f, false);
    const lose = B.tag==='shadow' ? 0 : Math.floor(p.gold*0.1);
    p.gold -= lose; p.hp = 1;
    log(p, B.tag==='shadow'
      ? '<b class="r">☠ 你被那影子打下了擂台，好在只是切磋，没伤筋动骨。</b>'
      : '<b class="r">☠ 你眼前一黑倒了下去……醒来时已被人抬回客栈，丢了 '+lose+' 两银子。</b>');
    if(B.tag !== 'shadow'){
      roomLog(p.scene, '<span class="d">'+p.name+'被'+f.name+'打倒，让人抬走了。</span>', p.name);
      const old = p.scene; p.scene = 'kezhan';
      syncRoom(old); roomLog('kezhan','<span class="d">'+p.name+'一身是伤，被人抬进了客栈。</span>', p.name);
    }else roomLog(p.scene, '<span class="d">'+p.name+'败在'+f.name+'手下。</span>', p.name);
  }
  sync(p); syncRoom(p.scene);
  autoIdle(p);                               // 打完接着修行，不用再点一次
}

/* 从尸首上搜出来的东西 */
function loot(p, lv){
  if(Math.random() < DROP.jingRate){
    const n = 1 + rnd(2); p.mats.jing += n;
    log(p, '　搜出<span class="n">精铁</span> ×'+n);
  }
  if(Math.random() < DROP.xuanRate(lv)){
    p.mats.xuan++;
    log(p, '　<b class="p">竟有一块玄晶！</b>');
  }
  if(Math.random() < DROP.equipRate){
    const t = DROP.tier(lv);
    const k = Math.random() < 0.5 ? 'w' : 'a';
    const list = k==='w' ? WEAPONS : ARMORS;
    const i = Math.max(1, Math.min(list.length-1, t - rnd(2)));
    const plusLv = Math.random() < 0.15 ? 1 + rnd(2) : 0;      // 偶尔捡到打造过的
    const it = list[i];
    if(p.bag.length >= F.bagMax){
      log(p, '　<span class="d">地上躺着一件'+it.name+'，可惜你背不动了。</span>');
    }else{
      p.bag.push({k, i, lv:plusLv});
      log(p, '　<b class="g">拾得 '+it.name+plus(plusLv)+'！</b>（已入行囊）');
      if(plusLv >= 2) roomLog(p.scene,'<span class="d">'+p.name+'从尸首上搜出一件'+it.name+plus(plusLv)+'。</span>', p.name);
    }
  }
}

/* ---- 切磋 ---- */
function challenge(p, targetName, bet){
  bet = Math.max(0, parseInt(bet)||0);
  const t = world.players.get(targetName);
  if(!t || !t.clients.size) return log(p,'<b>此地并无此人。</b>','warn');
  if(t.name===p.name) return log(p,'<b>自己跟自己较什么劲。</b>','warn');
  if(t.scene!==p.scene) return log(p,'<b>那人不在此处。</b>','warn');
  if(t.battle||p.battle) return log(p,'<b>有人正在动手，且慢。</b>','warn');
  if(t.pending) return log(p,'<b>'+t.name+'手上还有一桩事没答复。</b>','warn');
  if(bet > 0){
    if(p.gold < bet)  return log(p,'<b class="r">你押不起这个数。</b>');
    if(t.gold < bet)  return log(p,'<b>'+t.name+'的家当还不够押这个数。</b>','warn');
  }
  t.pending = {type:'pk', from:p.name, at:Date.now(), bet};
  const bs = bet>0 ? '，赌注 '+bet+' 两' : '';
  log(p, '<span class="b">你向 '+t.name+' 递了战书'+bs+'，静候回音……</span>');
  log(t, '<b class="r">⚔ '+p.name+'（'+p.lv+'级 '+titleOf(p.lv)+'）向你下了战书'+bs+'！</b>');
  roomLog(p.scene, '<span class="d">'+p.name+'向'+t.name+'递了战书'+bs+'。</span>');
  sync(t); sync(p);
  setTimeout(()=>{
    if(t.pending && t.pending.type==='pk' && t.pending.from===p.name){
      t.pending = null;
      log(p,'<span class="d">'+t.name+'未予理会，此事作罢。</span>'); log(t,'<span class="d">战书已过时效。</span>');
      sync(t); sync(p);
    }
  }, 45000);
}
function answer(p, ok){
  if(!p.pending) return;
  if(p.pending.type === 'wed') return answerWed(p, ok);
  const bet = p.pending.bet || 0;
  const a = world.players.get(p.pending.from); p.pending = null;
  if(!a || !a.clients.size || a.scene!==p.scene){ log(p,'<b>那人已不见踪影。</b>','warn'); return sync(p); }
  if(!ok){
    log(a, '<span class="d">'+p.name+'婉拒了你的战书。</span>'); log(p,'<span class="d">你婉拒了战书。</span>');
    return sync(p), sync(a);
  }
  if(a.battle||p.battle) return sync(p);
  if(bet > 0 && (a.gold < bet || p.gold < bet)){
    log(p,'<b>有人已经掏不出赌注，这场作罢。</b>','warn'); log(a,'<b>赌注不够，作罢。</b>','warn');
    return sync(p), sync(a);
  }
  a.buf = newBuf(); p.buf = newBuf();
  a.hp = Math.max(a.hp, F.maxHp(a)*0.5); p.hp = Math.max(p.hp, F.maxHp(p)*0.5);
  const first = F.dodge(a) >= F.dodge(p) ? a : p;         // 身法高的先出手
  const B = {kind:'pvp', a:a.name, b:p.name, round:0, bet, turn:first.name, deadline:0};
  a.battle = B; p.battle = B;
  toRoom(p.scene, {t:'log', scope:'pub', cls:'pk',
    html:'<b class="r">⚔ '+a.name+'（'+a.lv+'级）对 '+p.name+'（'+p.lv+'级）—— 二人抱拳一礼，动上了手！</b>'});
  stepPk(B);
}
const pkPair = B => [world.players.get(B.a), world.players.get(B.b)];
function stepPk(B){
  const [x, y] = pkPair(B);
  if(!x || !y || x.battle !== B || y.battle !== B) return;
  const actor = B.turn === x.name ? x : y;
  if(!actor.autoFight){
    B.deadline = Date.now() + 10000;
    sync(x); sync(y);
    return;
  }
  B.deadline = 0; sync(x); sync(y);
  setTimeout(()=>{ if(actor.battle === B) turnPk(actor, null); }, 700);
}
function turnPk(actor, sk){
  const B = actor.battle; if(!B || B.kind !== 'pvp' || B.turn !== actor.name) return;
  const [x, y] = pkPair(B);
  const other = actor === x ? y : x;
  const out = [];
  if(actor === x) B.round++;
  if(B.round > 40){
    toRoom(x.scene, {t:'log', scope:'pub', cls:'pk', html:'<b>斗了四十余合不分胜负，二人各自收招，抱拳而散。</b>'});
    x.battle = null; y.battle = null; return syncRoom(x.scene);
  }
  if(actor.buf.stunned){ actor.buf.stunned = false;
    out.push('　<span class="d">'+actor.name+'气血翻涌，这一招没使出来。</span>'); }
  else{
    const hp0 = other.hp;
    strike(actor, other, sk || bestSkill(actor), out);
    bounce(actor, other, hp0 - other.hp, out);
  }
  for(const h of out) toRoom(x.scene, {t:'log', scope:'pub', cls:'pk', html:h});
  if(other.hp <= 0) return endPk(actor, other, B);
  if(actor.hp <= 0) return endPk(other, actor, B);
  tickBuf(actor);
  B.turn = other.name;
  stepPk(B);
}
function endPk(win, lose, B){
  win.battle=null; lose.battle=null; win.buf=newBuf(); lose.buf=newBuf();
  lose.hp = 1; win.pkWin++; lose.pkLose++;
  const exp = Math.floor(F.need(lose.lv)*0.12*Math.max(.3, lose.lv/win.lv));
  toRoom(win.scene, {t:'log', scope:'pub', cls:'pk',
    html:'<b class="g">★ '+lose.name+'一个踉跄，退出圈外抱拳道：「承让。」——'+win.name+'胜。</b>'});
  // 赌注按输家「此刻真有多少」结算——打这半天他可能已经把钱花了
  const bet = Math.max(0, Math.min(B.bet || 0, lose.gold));
  if(bet > 0){
    const rake = Math.floor(bet*2*PRICE.pkRake);
    lose.gold -= bet; win.gold += bet - rake;
    toRoom(win.scene, {t:'log', scope:'pub', cls:'pk',
      html:'<span class="d">　彩金 '+(bet*2)+' 两，看客抽去 '+rake+' 两，'+win.name+'净得 '+(bet-rake)+' 两。</span>'+
           (bet < (B.bet||0) ? '<span class="d">（'+lose.name+'掏不出全数，按实有的算）</span>' : '')});
  }
  gainExp(win, exp);
  log(lose, '<span class="d">你输了这一场，气血耗尽，需歇息片刻。</span>');
  notice('<b>'+win.name+'</b> 在'+MAP[win.scene].name+'胜了 <b>'+lose.name+'</b>。');
  syncRoom(win.scene);
  autoIdle(win); autoIdle(lose);
}

/* 手动出招超时：10 秒不点，替他出默认招 */
setInterval(()=>{
  for(const p of online()){
    const B = p.battle;
    if(!B || !B.deadline || Date.now() < B.deadline) continue;
    B.deadline = 0;
    if(B.kind === 'pve'){ log(p,'<span class="d">（迟疑太久，你顺手就是一招）</span>'); turnPve(p, bestSkill(p)); }
    else if(B.turn === p.name){ log(p,'<span class="d">（迟疑太久，你顺手就是一招）</span>'); turnPk(p, bestSkill(p)); }
  }
}, 500);

function fightShadow(p, name){
  if(!MAP[p.scene].arena) return;
  const s2 = world.shadows.find(x => x.name === name);
  if(!s2) return log(p,'<span class="d">台上没这个人的影子。</span>');
  if(s2.name === p.name) return log(p,'<b>跟自己的影子打什么。</b>','warn');
  startFight(p, {
    name: s2.name+'的影子', lv:s2.lv, hp:s2.hp, atk:s2.atk, def:s2.def,
    exp: Math.floor(F.need(s2.lv)*0.10), gold:0, skills:s2.skills, shadow:s2.name,
  }, 'shadow');
}

module.exports = { startFight, turnPve, endPve, loot, challenge, answer, turnPk, endPk, bestSkill, fightShadow, mkFoe, newBuf, cAtk, cDef, cDodge, cCrit, cMaxHp, cMaxMp };

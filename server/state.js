/* 把玩家状态打包成发给前端的东西。sync 是全场最常被调用的函数：
   它顺手标记存档脏，并决定发全量还是只发几十字节的 vitals 小包。 */

'use strict';
const D = require('../gamedata');
const {SECTS,SKILLS,WEAPONS,ARMORS,MAP,MOBS,ARENA,GANG_FOE,EVENTS,ACTS,PRICE,MATS,DROP,F,titleOf,plus} = D;
const store = require('../store.js');
const {world, online, inRoom} = require('./core.js');

function stateOf(p){
  const sc = MAP[p.scene];
  return {
    t:'state',
    me:{
      name:p.name, lv:p.lv, exp:p.exp, need:F.need(p.lv), title:titleOf(p.lv),
      sect:p.sect?SECTS[p.sect].name:'无门无派', sectKey:p.sect,
      hp:Math.floor(p.hp), maxHp:F.maxHp(p), mp:Math.floor(p.mp), maxMp:F.maxMp(p),
      str:p.str, root:p.root, mind:p.mind, agi:p.agi, pot:p.pot,
      atk:Math.floor(F.atk(p)), def:Math.floor(F.def(p)),
      gold:p.gold, herb:p.herb, gangPts:p.gangPts, kills:p.kills,
      weapon:WEAPONS[p.weapon].name + plus(p.wLv), armor:ARMORS[p.armor].name + plus(p.aLv),
      wLv:p.wLv, aLv:p.aLv, wIdx:p.weapon, aIdx:p.armor, flowers:p.flowers, spouse:p.spouse,
      mats:p.mats, bagN:p.bag.length, bagMax:F.bagMax,
      mailN:p.mail.filter(m=>!m.read).length, quest:p.quest,
      bag:p.bag.map((it,i)=>({
        i, k:it.k, name:(it.k==='w'?WEAPONS[it.i]:ARMORS[it.i]).name + plus(it.lv),
        gain: it.k==='w' ? '攻 +'+Math.round(WEAPONS[it.i].atk*F.forge(it.lv))
                         : '防 +'+Math.round(ARMORS[it.i].def*F.forge(it.lv)),
        price:(it.k==='w'?WEAPONS[it.i]:ARMORS[it.i]).price })),
      together: !!(p.spouse && world.players.get(p.spouse) &&
                   world.players.get(p.spouse).clients.size && world.players.get(p.spouse).scene===p.scene),
      skills:p.skills.map(k=>SKILLS[k].name),
      idle: p.idle ? {act:sc.paodian.act, since:p.idle.since, acc:p.idle.acc} : null,
      fighting: !!p.battle, autoFight: !!p.autoFight,
      pkWin:p.pkWin, pkLose:p.pkLose,
    },
    room:{
      key:p.scene, name:sc.name, desc:sc.desc,
      exits:sc.exits.filter(k=>!(MAP[k].sectOnly && !p.sect)).map(k=>({k, name:MAP[k].name})),
      paodian: sc.paodian ? {act:sc.paodian.act, lv:sc.paodian.lv, tip:sc.paodian.tip} : null,
      hunt:!!sc.hunt, arena:!!sc.arena, gamble:!!sc.gamble, shop:sc.shop||null,
      joinsect:!!sc.joinsect, learn:!!sc.learn, gang:!!sc.gang, pk:!!sc.pk,
      treat:!!sc.treat, forge:!!sc.forge, market:!!sc.market,
      board:!!sc.board, quest:!!sc.quest,
      shadows: MAP[p.scene].arena ? world.shadows.map(s2=>({
        name:s2.name, lv:s2.lv, sect:s2.sect, title:s2.title,
        win:s2.win, lose:s2.lose, mine:s2.name===p.name })) : null,
      stalls: MAP[p.scene].market ? world.market.map(m=>({
        id:m.id, seller:m.seller, name:m.name, k:m.k, price:m.price,
        gain: m.k==='w' ? '攻 +'+m.gain : '防 +'+m.gain, mine: m.seller===p.name })) : null,
      people: inRoom(p.scene).map(q=>({
        name:q.name, lv:q.lv, title:titleOf(q.lv),
        sect:q.sect?SECTS[q.sect].name:'无门无派',
        act: q.battle ? '激斗中' : q.idle ? '修行中' : '闲逛',
        me: q.name===p.name,
      })),
    },
    world:{
      online: online().length,
      top: [...world.players.values()].sort((a,b)=> (b.lv-a.lv) || (b.exp-a.exp)).slice(0,10)
        .map(q=>({name:q.name, lv:q.lv, title:titleOf(q.lv),
                  sect:q.sect?SECTS[q.sect].name:'无门无派', on:q.clients.size>0})),
      rooms: Object.keys(MAP).map(k=>({
        k, name:MAP[k].name, n:inRoom(k).length,
        lock: !!(MAP[k].sectOnly && !p.sect), here:k===p.scene,
      })),
    },
    pending: p.pending ? {type:p.pending.type, from:p.pending.from, bet:p.pending.bet||0} : null,
    battle: battleView(p),
  };
}
/* 高频小包：挂机和打斗时每秒都在动的那几个数，几十字节 */
function vitals(p){
  const B = p.battle;
  return {
    t:'vitals',
    hp:Math.floor(p.hp), mp:Math.floor(p.mp), exp:p.exp, need:F.need(p.lv), lv:p.lv,
    gold:p.gold, herb:p.herb, pot:p.pot,
    acc: p.idle ? p.idle.acc : null,
    since: p.idle ? p.idle.since : null,
    foeHp: B && B.kind==='pve' ? Math.max(0,Math.floor(B.foe.hp)) : null,
    round: B ? B.round : null,
    wait: B && B.deadline ? Math.max(0, B.deadline - Date.now()) : 0,
    myTurn: B ? (B.kind==='pve' ? B.turn==='me' : B.turn===p.name) : null,
  };
}

function battleView(p){
  const B = p.battle; if(!B) return null;
  let foe, myTurn;
  if(B.kind === 'pve'){ foe = B.foe; myTurn = B.turn === 'me'; }
  else {
    const o = world.players.get(B.a === p.name ? B.b : B.a);
    if(!o) return null;
    foe = {name:o.name, hp:o.hp, max:F.maxHp(o), lv:o.lv};
    myTurn = B.turn === p.name;
  }
  return {
    kind:B.kind, round:B.round, bet:B.bet||0, myTurn,
    foe:{name:foe.name, lv:foe.lv, hp:Math.max(0,Math.floor(foe.hp)), max:foe.max},
    wait: myTurn && !p.autoFight && B.deadline ? Math.max(0, B.deadline - Date.now()) : 0,
    guard: p.buf && p.buf.guardT > 0, dodge: p.buf && p.buf.dodgeT > 0, stunned: !!(p.buf && p.buf.stunned),
    skills: p.skills.map(k=>{
      const s2 = SKILLS[k];
      return {k, name:s2.name, mp:s2.mp, mult:s2.mult, note:s2.note||'', ok:s2.mp <= p.mp};
    }),
  };
}
/* 这些数每秒都在动，由 vitals 小包负责；判断「全量要不要重发」时得先把它们挖掉，
   否则永远都算「变了」，等于没优化 */
const JITTER = new Set(['hp','mp','exp','need','gold','herb','pot','acc','since',
                        'wait','round','myTurn','foeHp']);
const steady = o => JSON.stringify(o, (k, v) => JITTER.has(k) ? undefined : v);

const sync = p => {
  store.markPlayer(p.name);
  if(!p.clients.size) return;
  const s = stateOf(p);
  const key = steady(s);
  const write = txt => p.clients.forEach(res => { try{ res.write('data: ' + txt + '\n\n'); }catch(e){} });
  if(key !== p._lastFull){                       // 界面结构变了：房间、人物、背包、战斗开始结束…
    p._lastFull = key;
    write(JSON.stringify(s));
    p._lastVit = JSON.stringify(vitals(p));
    return;
  }
  const v = JSON.stringify(vitals(p));           // 只是数字在跳：推几十字节就够
  if(v !== p._lastVit){ p._lastVit = v; write(v); }
};
const syncRoom = scene => { for(const q of inRoom(scene)) sync(q); };

module.exports = { stateOf, vitals, battleView, sync, syncRoom };

/* 银两的去处：打造、穿脱、寄卖集市、请客送花成亲。 */

'use strict';
const D = require('../gamedata');
const {SECTS,SKILLS,WEAPONS,ARMORS,MAP,MOBS,ARENA,GANG_FOE,EVENTS,ACTS,PRICE,MATS,DROP,F,titleOf,plus} = D;
const store = require('../store.js');
const {world, push, online, inRoom, toRoom, log, roomLog, notice} = require('./core.js');
const {sync} = require('./state.js');
const {gainExp} = require('./growth.js');

/* 打造：无底洞，也是唯一能把大钱吞掉的地方 */
function forge(p, kind){
  if(!MAP[p.scene].forge) return;
  const isW = kind === 'w';
  const it  = isW ? WEAPONS[p.weapon] : ARMORS[p.armor];
  const n   = isW ? p.wLv : p.aLv;
  if(!it.price) return log(p,'<b>空手赤膊，没什么可打的。</b>','warn');
  if(n >= F.forgeMax) return log(p,'<b class="g">已是 +'+F.forgeMax+'，炉火纯青，再打就要炸了。</b>');
  const cost = F.forgeCost(it.price, n), rate = F.forgeRate(n), mat = F.forgeMat(n);
  if(p.gold < cost) return log(p,'<b class="r">打造要 '+cost+' 两，你不够。</b>');
  if((p.mats[mat.k]||0) < mat.n)
    return log(p,'<b class="r">还须'+MATS[mat.k].name+' ×'+mat.n+'（你有 '+(p.mats[mat.k]||0)+
                 '），'+MATS[mat.k].tip+'，去打怪搜罢。</b>');
  p.gold -= cost; p.mats[mat.k] -= mat.n;
  const name = it.name + plus(n);
  log(p, '<span class="d">老铁匠把'+name+'塞进炉子，风箱呼呼地拉……（成功率 '+
         Math.round(rate*100)+'%，'+cost+' 两 + '+MATS[mat.k].name+'×'+mat.n+'）</span>');
  if(Math.random() < rate){
    if(isW) p.wLv++; else p.aLv++;
    const now = it.name + plus(isW ? p.wLv : p.aLv);
    log(p, '<b class="g">★ 锤声一停，'+now+'出炉，寒光更盛！</b>');
    roomLog(p.scene, '<span class="d">'+p.name+'打造出了'+now+'。</span>', p.name);
    const lv = isW ? p.wLv : p.aLv;
    if(lv >= 6) notice('<b>'+p.name+'</b> 打造出 <b>'+now+'</b>，围观的人都吸了口凉气。');
  }else{
    if(n >= 4){ if(isW) p.wLv--; else p.aLv--;
      log(p, '<b class="r">☠ 只听「咔」一声，'+name+'裂了道纹，退回 '+
             it.name+plus(isW?p.wLv:p.aLv)+'。</b>');
    }else log(p, '<span class="r">火候没到，白搭了 '+cost+' 两。</span>');
  }
  sync(p);
}

/* 请客：按人头掏钱，满屋子回血 */
function treat(p){
  if(!MAP[p.scene].treat) return;
  const guests = inRoom(p.scene).filter(q=>q.name!==p.name);
  if(!guests.length) return log(p,'<span class="d">店里就你一个，请谁去？</span>');
  const cost = PRICE.treat * guests.length;
  if(p.gold < cost) return log(p,'<b class="r">请这 '+guests.length+' 位要 '+cost+' 两，你不够。</b>');
  p.gold -= cost;
  toRoom(p.scene, {t:'log', scope:'pub', cls:'act',
    html:'<span class="act">＊ '+p.name+'把银子往柜上一拍：「小二！这屋里的酒钱都算我的！」</span>'});
  for(const q of guests){
    q.hp = F.maxHp(q); q.mp = F.maxMp(q);
    log(q, '<b class="n">你白喝了'+p.name+'一顿好酒，气血内力尽复。</b>');
    sync(q);
  }
  p.treats++;
  log(p, '<span class="d">这一顿花了 '+cost+' 两，值。</span>');
  if(guests.length >= 3) notice('<b>'+p.name+'</b> 在'+MAP[p.scene].name+'请了 '+guests.length+' 位江湖同道喝酒。');
  sync(p);
}

/* 送花 */
function flower(p, name){
  const t = world.players.get(name);
  if(!t || !t.clients.size || t.scene!==p.scene || t.name===p.name)
    return log(p,'<b>那人不在跟前。</b>','warn');
  if(p.gold < PRICE.flower) return log(p,'<b class="r">一朵花要 '+PRICE.flower+' 两，你囊中羞涩。</b>');
  p.gold -= PRICE.flower; t.flowers++;
  toRoom(p.scene, {t:'log', scope:'pub', cls:'act',
    html:'<span class="act">＊ '+p.name+'不知从哪儿变出一朵花来，红着脸递给'+t.name+'。</span>'});
  log(t, '<b class="p">你收下了'+p.name+'的花（至今收到 '+t.flowers+' 朵）。</b>');
  sync(p); sync(t);
}

/* 成亲 */
function propose(p, name){
  const t = world.players.get(name);
  if(!t || !t.clients.size || t.scene!==p.scene || t.name===p.name)
    return log(p,'<b>那人不在跟前。</b>','warn');
  if(p.spouse) return log(p,'<b>你已有家室，做人要厚道。</b>','warn');
  if(t.spouse) return log(p,'<b>'+t.name+'已有家室了。</b>','warn');
  if(t.pending) return log(p,'<b>'+t.name+'手上还有一桩事没答复。</b>','warn');
  if(p.gold < PRICE.betrothal) return log(p,'<b class="r">聘礼要 '+PRICE.betrothal+' 两，先去挣够了再来。</b>');
  t.pending = {type:'wed', from:p.name, at:Date.now()};
  log(p, '<span class="p">你向 '+t.name+' 提了亲，聘礼 '+PRICE.betrothal+' 两，就等回话了……</span>');
  log(t, '<b class="p">♡ '+p.name+' 向你提亲，聘礼 '+PRICE.betrothal+' 两。</b>');
  roomLog(p.scene, '<span class="act">＊ '+p.name+'向'+t.name+'提了亲，满屋子人都停了筷子。</span>');
  sync(p); sync(t);
  setTimeout(()=>{
    if(t.pending && t.pending.type==='wed' && t.pending.from===p.name){
      t.pending = null;
      log(p,'<span class="d">'+t.name+'没接话，这事就算过去了。</span>'); sync(p); sync(t);
    }
  }, 60000);
}
function answerWed(p, ok){
  const a = world.players.get(p.pending.from); p.pending = null;
  if(!a || !a.clients.size) { log(p,'<b>那人已不见踪影。</b>','warn'); return sync(p); }
  if(!ok){
    log(a, '<span class="d">'+p.name+'低头摆了摆手，没应。</span>');
    log(p, '<span class="d">你婉拒了'+a.name+'。</span>');
    return sync(p), sync(a);
  }
  if(a.gold < PRICE.betrothal){ log(a,'<b class="r">聘礼不够了。</b>'); return sync(p), sync(a); }
  a.gold -= PRICE.betrothal; p.gold += PRICE.betrothal;      // 聘礼归对方，不消失
  a.spouse = p.name; p.spouse = a.name;
  a.wedAt = p.wedAt = Date.now();
  notice('<b>'+a.name+'</b> 与 <b>'+p.name+'</b> 结为夫妻，江湖同贺！');
  log(a, '<b class="p">♡ 你与'+p.name+'结为夫妻。二人同处一地修行，功力涨得快一成。</b>');
  log(p, '<b class="p">♡ 你与'+a.name+'结为夫妻。二人同处一地修行，功力涨得快一成。</b>');
  sync(p); sync(a);
}
function wedding(p){
  if(!p.spouse) return log(p,'<b>你还没成亲。</b>','warn');
  if(p.gold < PRICE.wedding) return log(p,'<b class="r">摆一场喜宴要 '+PRICE.wedding+' 两。</b>');
  p.gold -= PRICE.wedding;
  notice('<b>'+p.name+'</b> 与 <b>'+p.spouse+'</b> 在'+MAP[p.scene].name+
         '大摆喜宴，全江湖同饮此杯！在场诸位皆有喜气。');
  for(const q of online()){
    q.hp = F.maxHp(q); q.mp = F.maxMp(q);
    gainExp(q, Math.floor(F.need(q.lv)*0.03));
    log(q, '<span class="p">你也讨到一杯喜酒，浑身通泰。</span>');
    sync(q);
  }
}
function divorce(p){
  if(!p.spouse) return;
  if(p.gold < PRICE.divorce) return log(p,'<b class="r">和离也要 '+PRICE.divorce+' 两写状子。</b>');
  p.gold -= PRICE.divorce;
  const t = world.players.get(p.spouse);
  if(t && t.spouse===p.name){ t.spouse = null; t.wedAt = 0;
    log(t,'<b class="r">'+p.name+'与你和离了。</b>'); sync(t); }
  log(p, '<span class="d">你与'+p.spouse+'一别两宽。</span>');
  p.spouse = null; p.wedAt = 0; sync(p);
}

/* 背包 */
function equip(p, slot){
  const it = p.bag[slot]; if(!it) return;
  const isW = it.k === 'w';
  const cur = isW ? p.weapon : p.armor, curLv = isW ? p.wLv : p.aLv;
  const nm = (isW ? WEAPONS[it.i] : ARMORS[it.i]).name + plus(it.lv);
  if(isW){ p.weapon = it.i; p.wLv = it.lv; } else { p.armor = it.i; p.aLv = it.lv; }
  p.bag.splice(slot, 1);
  if(cur) p.bag.push({k:it.k, i:cur, lv:curLv});           // 换下的收进行囊
  log(p, '<b class="g">你换上了'+nm+'。</b>');
  sync(p);
}
function unequip(p, kind){
  const isW = kind === 'w';
  const cur = isW ? p.weapon : p.armor, curLv = isW ? p.wLv : p.aLv;
  if(!cur) return log(p,'<b>本来就是空手／布衣。</b>','warn');
  if(p.bag.length >= F.bagMax) return log(p,'<b class="r">行囊满了。</b>');
  p.bag.push({k:kind, i:cur, lv:curLv});
  if(isW){ p.weapon = 0; p.wLv = 0; } else { p.armor = 0; p.aLv = 0; }
  log(p, '<span class="d">你把它卸下收进了行囊。</span>');
  sync(p);
}
function dropIt(p, slot){
  const it = p.bag[slot]; if(!it) return;
  const nm = (it.k==='w' ? WEAPONS[it.i] : ARMORS[it.i]).name + plus(it.lv);
  p.bag.splice(slot, 1);
  log(p, '<span class="d">你把'+nm+'随手扔了。</span>');
  sync(p);
}

/* 寄卖摊：装备连同打造等级一起转手，成交抽一成 */
function stall(p, slot, price){
  store.markWorld();
  if(!MAP[p.scene].market) return log(p,'<b>此处没有集市。</b>','warn');
  price = Math.max(1, parseInt(price)||0);
  const it = p.bag[slot]; if(!it) return;
  const base = it.k==='w' ? WEAPONS[it.i] : ARMORS[it.i];
  if(!base.price) return log(p,'<b>这种白给的东西，摆出去也没人要。</b>','warn');
  if(world.market.filter(m=>m.seller===p.name).length >= 3)
    return log(p,'<b>你最多同时摆三样。</b>','warn');
  p.bag.splice(slot, 1);
  world.market.push({id:++world.mseq, seller:p.name, k:it.k, idx:it.i, lv:it.lv, price,
    name: base.name + plus(it.lv),
    gain: it.k==='w' ? Math.round(base.atk*F.forge(it.lv)) : Math.round(base.def*F.forge(it.lv))});
  log(p, '<span class="b">你把'+base.name+plus(it.lv)+'摆上了长街的摊子，标价 '+price+' 两。</span>');
  roomLog(p.scene, '<span class="d">'+p.name+'在街边支了个摊，卖'+base.name+plus(it.lv)+'，'+price+' 两。</span>', p.name);
  sync(p);
}
function unstall(p, id){
  store.markWorld();
  const i = world.market.findIndex(m=>m.id===+id && m.seller===p.name);
  if(i < 0) return;
  if(p.bag.length >= F.bagMax) return log(p,'<b class="r">行囊满了，收不回来。</b>');
  const m = world.market[i];
  p.bag.push({k:m.k, i:m.idx, lv:m.lv});
  world.market.splice(i,1);
  log(p, '<span class="d">你把'+m.name+'收了回来。</span>');
  sync(p);
}
function buyStall(p, id){
  store.markWorld();
  const i = world.market.findIndex(m=>m.id===+id);
  if(i < 0) return log(p,'<span class="d">这件已经被人买走了。</span>');
  const m = world.market[i];
  if(m.seller === p.name) return log(p,'<b>自己的摊子，买什么。</b>','warn');
  if(p.gold < m.price) return log(p,'<b class="r">银两不足。</b>');
  if(p.bag.length >= F.bagMax) return log(p,'<b class="r">行囊满了，先腾个地方。</b>');
  world.market.splice(i,1);
  p.gold -= m.price;
  const tax = Math.floor(m.price * PRICE.stallTax);          // 这笔钱离开江湖
  const seller = world.players.get(m.seller);
  if(seller){
    seller.gold += m.price - tax;
    log(seller, '<b class="g">你的'+m.name+'被'+p.name+'买走了，得 '+(m.price-tax)+
                ' 两（抽头 '+tax+' 两）。</b>');
    sync(seller);
  }
  p.bag.push({k:m.k, i:m.idx, lv:m.lv});
  log(p, '<b class="g">你买下了'+m.name+'（原主 '+m.seller+'），花去 '+m.price+' 两，已入行囊。</b>');
  roomLog(p.scene, '<span class="d">'+p.name+'买走了'+m.seller+'摊上的'+m.name+'。</span>', p.name);
  sync(p);
}

module.exports = { forge, treat, flower, propose, answerWed, wedding, divorce, equip, unequip, dropIt, stall, unstall, buyStall };

/* 一个人也玩得下去的那些：客栈告示、书信、衙门悬赏、擂台留影。 */

'use strict';
const D = require('../gamedata');
const {SECTS,SKILLS,WEAPONS,ARMORS,MAP,MOBS,ARENA,GANG_FOE,EVENTS,ACTS,PRICE,MATS,DROP,F,titleOf,plus} = D;
const store = require('../store.js');
const {world, save, push, log, roomLog, notice, esc, rnd, pick} = require('./core.js');
const {sync, syncRoom} = require('./state.js');
const {gainExp} = require('./growth.js');
const {ago} = require('./idle.js');

/* 客栈墙上的告示板：离线也留得住，新人进来能看见江湖上都发生过什么 */
function readBoard(p){
  const list = world.board.slice(-14).reverse();
  if(!list.length) return log(p,'<span class="d">墙上光秃秃的，还没人贴过东西。</span>');
  log(p, '<b>【客栈墙上的告示】</b>');
  for(const b of list)
    log(p, '<span class="d">'+ago(b.ts)+'　</span><span class="who">'+b.who+
           '</span><span class="d">（'+b.lv+'级 '+b.sect+'）：</span>'+b.text);
  log(p, '<span class="d">—— 共 '+world.board.length+' 条，贴一张自己的：底下输入框选「告示」频道。</span>');
}
function postBoard(p, text){
  store.markWorld();
  text = String(text||'').slice(0,80).trim();
  if(!text) return;
  world.board.push({id:++world.bseq, who:p.name, lv:p.lv,
                    sect:p.sect?SECTS[p.sect].name:'无门无派', text:esc(text), ts:Date.now()});
  while(world.board.length > 200) world.board.shift();
  log(p, '<b class="g">你在客栈墙上贴了张纸条。</b>');
  roomLog(p.scene, '<span class="d">'+p.name+'往墙上贴了张纸条。</span>', p.name);
  notice('<b>'+p.name+'</b> 在客栈墙上留了话：'+esc(text).slice(0,40));
  save();
}

/* 书信：给不在线的人也能捎话捎钱 */
function sendMail(p, to, text, gold){
  const t = world.players.get(String(to||'').trim());
  if(!t) return log(p,'<b>江湖上没有这号人。</b>','warn');
  if(t.name === p.name) return log(p,'<b>自己给自己写信？</b>','warn');
  text = String(text||'').slice(0,200).trim();
  gold = Math.max(0, Math.min(p.gold, parseInt(gold)||0));
  if(!text && !gold) return;
  p.gold -= gold;
  t.mail.push({id:Date.now()+rnd(999), from:p.name, text:esc(text), gold, ts:Date.now(), read:false});
  while(t.mail.length > 50) t.mail.shift();
  log(p, '<b class="b">信已托镖局捎去给'+t.name+''+(gold?'，附银 '+gold+' 两':'')+'。</b>');
  if(t.clients.size){
    log(t, '<b class="p">✉ '+p.name+'给你捎来一封信。</b>');
    sync(t);
  }
  sync(p); save();
}
function readMail(p){
  if(!p.mail.length) return log(p,'<span class="d">信箱空空。</span>');
  log(p, '<b>【你的信】</b>');
  let got = 0;
  for(const m of p.mail.slice().reverse()){
    log(p, '<span class="d">'+ago(m.ts)+'　</span><span class="who">'+m.from+'</span>'+
           '<span class="d">：</span>'+(m.text||'<span class="d">（没写字）</span>')+
           (m.gold?'　<span class="g">附银 '+m.gold+' 两</span>':''));
    if(!m.read){ m.read = true; got += m.gold || 0; }
  }
  if(got){ p.gold += got; log(p, '<b class="g">信里的 '+got+' 两银子已收下。</b>'); }
  sync(p); save();
}

/* 衙门悬赏：一个人也有事干，而且有目标 */
function newQuest(p){
  const pool = Object.entries(MOBS).filter(([k,m]) => m.lv <= p.lv+2 && m.lv >= p.lv-14);
  const [k, m] = pick(pool.length ? pool : [['pi', MOBS.pi]]);
  const need = 3 + rnd(4);
  const spot = Object.entries(MAP).find(([, sc]) => sc.hunt && sc.hunt.includes(k));
  return {k, name:m.name, lv:m.lv, need, got:0, where: spot ? spot[1].name : '',
          exp:Math.floor(m.exp*need*0.9), gold:Math.floor(m.gold*need*1.3),
          mat: m.lv>=20 ? 'xuan' : 'jing', matN: 1+rnd(2), at:Date.now()};
}
function takeQuest(p){
  if(!MAP[p.scene].quest) return;
  if(p.quest) return log(p,'<span class="d">捕头瞥你一眼：手上那桩还没了呢。</span>');
  p.quest = newQuest(p);
  const q = p.quest;
  log(p, '<b class="p">〖悬赏〗</b>捕头把一张海捕文书拍在桌上：「'+q.name+'（'+q.lv+
         '级）近来在'+(q.where||'城外')+'一带闹得凶，宰 <b>'+q.need+'</b> 个回来。」');
  log(p, '<span class="d">　赏：银 '+q.gold+' 两、经验 '+q.exp+'、'+MATS[q.mat].name+' ×'+q.matN+'</span>');
  sync(p);
}
function turnQuest(p){
  if(!MAP[p.scene].quest || !p.quest) return;
  const q = p.quest;
  if(q.got < q.need)
    return log(p,'<span class="d">捕头摇头：「'+q.name+'才宰了 '+q.got+' 个，还差 '+(q.need-q.got)+' 个。」</span>');
  p.quest = null;
  p.gold += q.gold; p.mats[q.mat] = (p.mats[q.mat]||0) + q.matN;
  log(p, '<b class="g">★ 捕头验过首级，赏银 '+q.gold+' 两、'+MATS[q.mat].name+' ×'+q.matN+'。</b>');
  gainExp(p, q.exp);
  sync(p);
}
function questKill(p, mobKey){
  const q = p.quest;
  if(!q || q.k !== mobKey || q.got >= q.need) return;
  q.got++;
  log(p, '　<span class="p">〖悬赏〗'+q.name+' '+q.got+' / '+q.need+
         (q.got>=q.need ? '　—— 够数了，回客栈交差' : '')+'</span>');
}

/* 擂台守擂：把自己的身手留在台上，人走了也有人替你打 */
function leaveShadow(p){
  store.markWorld();
  if(!MAP[p.scene].arena) return;
  world.shadows = world.shadows.filter(s2 => s2.name !== p.name);
  world.shadows.push({
    name:p.name, lv:p.lv, sect:p.sect?SECTS[p.sect].name:'无门无派', title:titleOf(p.lv),
    hp:Math.floor(F.maxHp(p)), atk:Math.floor(F.atk(p)), def:Math.floor(F.def(p)),
    skills:p.skills.slice(), ts:Date.now(), win:0, lose:0,
  });
  while(world.shadows.length > 12) world.shadows.shift();
  log(p, '<b class="g">★ 你在擂台上留下一路拳脚，往后有人挑战，便由它替你应付。</b>');
  notice('<b>'+p.name+'</b> 在洛阳擂台上摆下擂来，有胆的尽管去试。');
  save(); syncRoom(p.scene);
}
/* 打完影子的后续：给主人捎个信 */
function shadowResult(p, foe, win){
  const s2 = world.shadows.find(x => x.name === foe.shadow);
  if(!s2) return;
  if(win) s2.lose++; else s2.win++;
  const owner = world.players.get(foe.shadow);
  if(owner){
    owner.mail.push({id:Date.now()+rnd(999), from:'洛阳擂台', gold:0, ts:Date.now(), read:false,
      text: win ? esc(p.name)+'（'+p.lv+'级）挑了你的擂，你的影子输了。'
                : esc(p.name)+'（'+p.lv+'级）来挑你的擂，被你的影子打了下去。'});
    while(owner.mail.length > 50) owner.mail.shift();
    if(owner.clients.size){ log(owner, '<b class="p">✉ 擂台捎来消息：'+
      (win ? p.name+'把你的影子打下去了。' : '你的影子守住了擂台，赢了 '+p.name+'。')+'</b>'); sync(owner); }
  }
  save();
}

module.exports = { readBoard, postBoard, sendMail, readMail, newQuest, takeQuest, turnQuest, questKill, leaveShadow, shadowResult };

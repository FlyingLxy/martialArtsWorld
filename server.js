'use strict';
/* 泡点江湖 · 多人服务端（零依赖：node server.js） */
const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const D = require('./game-data.js');
const {SECTS,SKILLS,WEAPONS,ARMORS,MAP,MOBS,ARENA,GANG_FOE,EVENTS,ACTS,PRICE,MATS,DROP,F,titleOf,plus} = D;

const PORT = process.env.PORT || 8080;
const DATA = path.join(__dirname, 'data.json');
const PUB  = path.join(__dirname, 'public');

/* ============ 世 界 ============ */
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
const RUNTIME = ['clients','idle','battle','pending','buf'];

let saveTimer = null, saveDirty = false;
/* 存档：合并频繁调用，写的时候先写临时文件再原子替换，绝不留半截文件 */
function save(immediate){
  saveDirty = true;
  if(immediate){
    if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
    return flush();
  }
  if(saveTimer) return;
  saveTimer = setTimeout(()=>{ saveTimer = null; flush(); }, 2000);
}
function flush(){
  if(!saveDirty) return;
  saveDirty = false;
  const players = {};
  for(const [n,p] of world.players){
    const o = {}; for(const k in p) if(!RUNTIME.includes(k)) o[k]=p[k];
    players[n] = o;
  }
  const blob = JSON.stringify({players, market:world.market, mseq:world.mseq,
                               board:world.board, bseq:world.bseq, shadows:world.shadows});
  const tmp = DATA + '.tmp';
  try{
    const fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, blob);
    fs.fsyncSync(fd);                                   // 逼它真的落盘，别留在缓存里
    fs.closeSync(fd);
    if(fs.existsSync(DATA)) fs.copyFileSync(DATA, DATA + '.bak');   // 上一份好的留作备份
    fs.renameSync(tmp, DATA);                           // 这一步是原子的：要么旧的要么新的
  }catch(e){
    console.error('！存档写失败：', e.message);
  }
}
function load(){
  for(const file of [DATA, DATA + '.bak']){
    if(!fs.existsSync(file)) continue;
    try{
      const f = JSON.parse(fs.readFileSync(file, 'utf8'));
      const raw = f.players || f;                       // 兼容早先的格式
      if(f.market){ world.market = f.market; world.mseq = f.mseq || 0; }
      if(f.board){ world.board = f.board; world.bseq = f.bseq || 0; }
      if(f.shadows) world.shadows = f.shadows;
      for(const n in raw){
        const p = Object.assign(newPlayer(n,'x'), raw[n]);
        p.clients = new Set(); p.idle = null; p.battle = null; p.pending = null; p.buf = null;
        if(!p.bag) p.bag = [];
        if(!p.mats) p.mats = {jing:0, xuan:0};
        if(!p.mail) p.mail = [];
        if(p.quest === undefined) p.quest = null;
        world.players.set(n, p);
      }
      console.log('已读入 ' + world.players.size + ' 名玩家' +
                  (world.market.length ? '，' + world.market.length + ' 个摊位' : '') +
                  (file.endsWith('.bak') ? '　※ 主存档坏了，是从备份恢复的' : ''));
      return;
    }catch(e){
      console.error('！' + file + ' 读不了（' + e.message + '）' +
                    (file === DATA ? '，改用备份……' : ''));
    }
  }
  console.log('全新的江湖，还没有人。');
}

/* ============ 推 送 ============ */
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

/* ============ 状 态 ============ */
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
const sync = p => push(p, stateOf(p));
const syncRoom = scene => { for(const q of inRoom(scene)) sync(q); };

/* ============ 成 长 ============ */
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

/* ============ 战 斗 ============ */
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

/* ============ 泡 点 ============ */
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
    const dt = now - p.idle.last;
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
setInterval(save, 30000);
setInterval(()=>{ for(const p of online()) push(p, {t:'ping'}); }, 20000);


/* ============ 银两的出路 ============ */

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

/* ============ 一个人也能玩的：告示、信、悬赏 ============ */

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

/* ============ 指 令 ============ */
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

/* ============ HTTP ============ */
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
              '.css':'text/css; charset=utf-8','.ico':'image/x-icon'};
function body(req){
  return new Promise(res=>{ let b=''; req.on('data',c=>{ b+=c; if(b.length>4096) req.destroy(); });
                            req.on('end',()=>{ try{ res(JSON.parse(b||'{}')); }catch(e){ res({}); } }); });
}
const json = (res, o) => { res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(o)); };

const server = http.createServer(async (req, res)=>{
  const u = new URL(req.url, 'http://x');

  if(u.pathname === '/api/login'){
    const b = await body(req);
    const name = String(b.name||'').trim().slice(0,10), pass = String(b.pass||'');
    if(!name || !pass) return json(res,{err:'名号和暗号都不能空着。'});
    if(/[<>&"'\s]/.test(name)) return json(res,{err:'名号里不能有空格和奇怪符号。'});
    let p = world.players.get(name);
    if(p){ if(p.pass !== hash(pass)) return json(res,{err:'暗号不对。'}); }
    else if(!b.create){
      // 名号打错一个字就闷声建个新号，会让人以为存档丢了——先问一句
      return json(res, {isNew:true, name});
    }
    else { p = newPlayer(name, pass); p.hp=F.maxHp(p); p.mp=F.maxMp(p); world.players.set(name,p);
           notice('<b>'+name+'</b> 初入江湖，落脚在杏花村。'); save(); }
    const token = crypto.randomBytes(16).toString('hex');
    world.tokens.set(token, name);
    return json(res, {token, name});
  }

  if(u.pathname === '/api/cmd'){
    const b = await body(req);
    const name = world.tokens.get(b.token); const p = name && world.players.get(name);
    if(!p) return json(res,{err:'no-auth'});
    const fn = CMD[b.cmd];
    if(fn){ try{ fn(p, b.args||{}); }catch(e){ console.error('cmd '+b.cmd, e); } }
    return json(res, {ok:1});
  }

  if(u.pathname === '/api/events'){
    const name = world.tokens.get(u.searchParams.get('token'));
    const p = name && world.players.get(name);
    if(!p){ res.writeHead(401); return res.end(); }
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache',
                        'Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write('retry: 3000\n\n');
    const first = p.clients.size === 0;
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
    res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});
    return res.end(fs.readFileSync(path.join(__dirname,'game-data.js')));
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

load();
function bye(sig){
  save(true);
  console.log('\n已存档，江湖再会。（' + sig + '）');
  process.exit(0);
}
process.on('SIGINT',  ()=>bye('Ctrl+C'));
process.on('SIGTERM', ()=>bye('SIGTERM'));
process.on('SIGHUP',  ()=>bye('终端关闭'));
process.on('uncaughtException', e => {
  console.error('！出了个没接住的岔子：', e);
  save(true);                                           // 崩之前先把命保住
  process.exit(1);
});
server.listen(PORT, ()=>{
  const nets = require('node:os').networkInterfaces();
  const lan = Object.values(nets).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log('\n  ╔══════════════════════════════════════════╗');
  console.log('  ║          泡 点 江 湖  已 开 服           ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('  本机：  http://localhost:' + PORT);
  for(const ip of lan) console.log('  同局域网的朋友： http://' + ip + ':' + PORT);
  console.log('  存档：  ' + DATA + '（每 30 秒自动写盘）');
  console.log('  Ctrl+C 存档并关服\n');
});

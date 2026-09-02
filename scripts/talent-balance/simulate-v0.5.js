#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const TALENT_DOC = path.join(ROOT, 'docs/talent-system.md');
const ACTIVE_DOC = path.join(ROOT, 'docs/active-skills.md');
const RESULT_FILE = path.join(__dirname, 'v0.5-results.json');
const SEED = 20260905;
const REPEATS = Number(process.env.BALANCE_REPEATS || 3);
const MAX_ROUNDS = 40;

const SCHOOL_ORDER = ['少林寺','武当派','峨眉派','丐帮','华山派','奥术学院','王冠骑士团','影之忍宗','北海战团','太阳神殿'];

const SKILLS = {
  少林寺: [
    ['大力金刚指',.94,.08,0,['fist'],'basic'], ['韦陀伏魔掌',1.04,.11,1,['fist','heavy'],'main'],
    ['狮子吼',.69,.14,4,['fist'],'tactic'], ['易筋经',.36,.15,4,['fist','heal','guard'],'survival'],
    ['不坏法身',1.39,.25,99,['fist','guard','ultimate'],'ultimate'] ],
  武当派: [
    ['两仪剑法',1.03,.08,0,['weapon','multi'],'basic'], ['揽雀尾',1.13,.10,1,['fist'],'main'],
    ['太极云手',.74,.13,4,['fist','guard'],'tactic'], ['纯阳护体',.45,.14,4,['spell','guard'],'survival'],
    ['真武七截阵',1.49,.26,99,['weapon','spell','multi','ultimate'],'ultimate'] ],
  峨眉派: [
    ['飞针探穴',.99,.08,0,['weapon','multi'],'basic'], ['流风回雪',1.09,.11,1,['weapon','multi'],'main'],
    ['截脉封穴',.73,.14,4,['fist'],'tactic'], ['回风拂柳',.39,.15,4,['weapon','heal','shield'],'survival'],
    ['飘雪无尽',1.49,.25,99,['weapon','multi','ultimate'],'ultimate'] ],
  丐帮: [
    ['缠字诀',1.09,.08,0,['weapon'],'basic'], ['亢龙有悔',1.28,.11,1,['fist','heavy'],'main'],
    ['拨狗朝天',.95,.13,3,['weapon'],'tactic'], ['醉步横斜',.62,.14,4,['fist','guard'],'survival'],
    ['龙战于野',1.57,.26,99,['fist','heavy','multi','ultimate'],'ultimate'] ],
  华山派: [
    ['寒星一点',.95,.08,0,['weapon'],'basic'], ['狂风快剑',1.01,.11,1,['weapon','multi'],'main'],
    ['无招胜有招',.86,.13,3,['weapon'],'tactic'], ['紫霞神功',.45,.14,4,['weapon','spell','guard'],'survival'],
    ['九剑归一',1.42,.25,99,['weapon','ultimate'],'ultimate'] ],
  奥术学院: [
    ['元素轮转',.99,.08,0,['spell'],'basic'], ['雷霆传导',.98,.12,1,['spell','multi'],'main'],
    ['反咒',.72,.14,3,['spell','guard'],'tactic'], ['万用解毒剂',.40,.14,4,['spell','heal'],'survival'],
    ['大法师共鸣',1.44,.27,99,['spell','multi','ultimate'],'ultimate'] ],
  王冠骑士团: [
    ['盾牌反击',.74,.08,0,['weapon','guard'],'basic'], ['骑枪贯穿',.87,.12,1,['weapon','heavy'],'main'],
    ['冲锋准备',.52,.13,3,['weapon','cast','guard'],'tactic'], ['举盾',.34,.14,4,['weapon','guard','shield'],'survival'],
    ['不落壁垒',.99,.25,99,['weapon','guard','ultimate'],'ultimate'] ],
  影之忍宗: [
    ['苦无试探',1.02,.08,0,['weapon','multi'],'basic'], ['混毒刃',1.03,.11,1,['weapon','dot'],'main'],
    ['爆毒',.88,.13,3,['weapon','dot'],'tactic'], ['烟幕替身',.55,.14,4,['guard'],'survival'],
    ['一闪绝命',1.42,.25,99,['weapon','heavy','ultimate'],'ultimate'] ],
  北海战团: [
    ['血怒斩',.92,.07,0,['weapon'],'basic'], ['碎甲重斧',1.03,.12,1,['weapon','heavy'],'main'],
    ['威压横扫',.82,.14,3,['weapon','heavy'],'tactic'], ['战吼',.39,.14,4,['guard','heal'],'survival'],
    ['诸神黄昏',1.23,.26,99,['weapon','multi','ultimate'],'ultimate'] ],
  太阳神殿: [
    ['初阳术',.95,.08,0,['spell'],'basic'], ['沙海恶咒',.98,.11,1,['spell','dot'],'main'],
    ['提前宣判',.84,.13,3,['spell'],'tactic'], ['日光净礼',.37,.15,4,['spell','heal','shield'],'survival'],
    ['太阳审判',1.37,.27,99,['spell','ultimate'],'ultimate'] ]
};

function validateActiveSkillDoc(){
  const lines=fs.readFileSync(ACTIVE_DOC,'utf8').split(/\r?\n/);
  const expectedNames=new Set(Object.values(SKILLS).flat().map(skill=>skill[0]));
  const powers=new Map();
  for(const line of lines){
    const row=line.match(/^\| [1-5]·([^|]+) \|.*\| ([^|]+) \|$/);if(!row)continue;
    const name=row[1].trim();if(!expectedNames.has(name))continue;
    const power=row[2].match(/(\d+\.\d+)/);if(power)powers.set(name,Number(power[1]));
  }
  for(const [school,skills] of Object.entries(SKILLS))for(const skill of skills){
    if(!powers.has(skill[0]))throw new Error(`主动技能文档缺少威力: ${school}·${skill[0]}`);
    if(Math.abs(powers.get(skill[0])-skill[1])>1e-9)throw new Error(`主动技能威力不一致: ${school}·${skill[0]} 文档=${powers.get(skill[0])} 模拟=${skill[1]}`);
  }
  if(powers.size!==50)throw new Error(`主动技能文档应为50门，实际${powers.size}`);
}
validateActiveSkillDoc();

const CATEGORIES = {
  offense: new Set(`心如磐石 伏虎劲 以守为攻 伏魔循环 金刚怒目 借力还力 阴阳轮转 七截共鸣 真武剑阵 飞针探穴 连环不绝 流风回雪 飘雪无尽 截腕 掌裂山河 十八掌意 龙战于野 天下无狗 八仙过海 醉里乾坤 寒星一点 夺先 剑到人亡 狂风快剑 一剑冲霄 气贯长剑 养吾气 气剑合一 破剑式 破掌式 无招胜有招 永燃火种 寒霜塑形 雷霆传导 奥术过载 咒术回响 挥发药剂 盾牌反击 长枪架势 骑枪贯穿 破阵枪 誓约共鸣 潜行 处决窗口 一闪绝命 混毒 渗骨 爆毒 百毒归一 化骨无形 影分身 血染战意 向死而战 诸神黄昏 重斧专精 雪崩之势 开天巨斧 提前宣判 正午神威 太阳审判 沙海恶咒 心脏天平 冥府开门`.split(' ')),
  defense: new Set(`铜皮铁骨 心如磐石 暮鼓晨钟 不动根 罗汉架 伏魔循环 药师心 慈航护念 枯荣禅 不坏法身 云手 引劲落空 太极无极 气沉丹田 纯阳护体 踏罡步斗 雪影回旋 见龙在田 飞龙在天 醉步 佯醉 借势翻身 破剑式 无声施法 咒语延展 反咒 强制解除 禁忌篇章 重甲训练 坚守阵线 移动堡垒 不落壁垒 荣誉誓言 纯洁誓言 牺牲誓言 骑士不倒 残影 烟幕 替身术 空蝉无形 濒死怒吼 横扫 威压 不屈歌 英灵战歌 圣甲虫护符 守护神像 神明降临`.split(' ')),
  sustain: new Set(`步步生莲 易筋吐纳 洗髓功 慈航护念 枯荣禅 达摩渡厄 抱元守一 生生不息 紫府清明 纯阳无极功 峨眉心法 回风拂柳 佛光护体 清心诀 生生相济 佛光普照 拨字诀 紫霞初升 养吾气 剑气护身 紫气东来 元素轮转 咒术回响 战斗配方 万用解毒剂 等价转化 贤者之石 怜悯誓言 纯洁誓言 骑士不倒 伤痛为薪 以血换怒 战吼 凯旋歌 英灵合唱 灵魂汲取 神官祝福 代偿神佑 神明降临`.split(' ')),
  control: new Set(`禅震 金刚怒目 引劲落空 真武剑阵 封脉 止血 九式连封 绝脉一瞬 缠字诀 绊字诀 封兵诀 打狗宗师 观招 九剑归一 咒语延展 反咒 禁忌篇章 移动堡垒 冲锋准备 骑枪贯穿 破阵枪 王者冲锋 牺牲誓言 处决窗口 月下追影 抑生毒 替身术 濒死怒吼 横扫 碎甲 威压 开天巨斧 不屈歌 英灵战歌 黎明灼光 烈日当空 冥河迟滞 木乃伊之缚 冥府开门 日光净礼 守护神像 神明降临`.split(' ')),
  resource: new Set(`铜皮铁骨 金刚怒目 听劲 云手 阴阳轮转 抱元守一 生生不息 纯阳护体 纯阳无极功 两仪起势 七星落位 梯云换位 真武剑阵 踏雪无痕 连环不绝 飘雪无尽 识穴 封脉 绝脉一瞬 生生相济 亢龙势 见龙在田 飞龙在天 醉步 酒中藏招 佯醉 借势翻身 八仙过海 醉里乾坤 剑走轻灵 紫霞初升 剑气护身 紫气东来 破气式 元素轮转 奥术过载 大法师共鸣 战斗配方 万用解毒剂 元素催化剂 挥发药剂 等价转化 贤者之石 举盾 不落壁垒 冲锋准备 骑枪贯穿 追击 破阵枪 纯洁誓言 牺牲誓言 誓约共鸣 骑士不倒 苦无试探 嗅血 月下追影 一闪绝命 虚实相生 伤痛为薪 以血换怒 诸神黄昏 鼓点 不屈歌 英灵合唱 英灵战歌 初阳印记 太阳审判 灵魂汲取 冥河迟滞 代偿神佑 神明降临`.split(' '))
};

function parseTalents(){
  const lines = fs.readFileSync(TALENT_DOC,'utf8').split(/\r?\n/);
  const out = {}; let school=null, branch=null, tier=1;
  for(const line of lines){
    let m=line.match(/^### 4\.\d+ (.+)$/); if(m){ school=m[1]; out[school]=[]; continue; }
    m=line.match(/^#### 4\.\d+\.\d+ (.+)$/); if(m){ branch=[]; out[school].push(branch); continue; }
    m=line.match(/^##### (第一|第二|第三|第四)层/); if(m){ tier={第一:1,第二:2,第三:3,第四:4}[m[1]]; continue; }
    m=line.match(/^- \*\*(.+?)\*\*：(.+)$/); if(m && branch) branch.push({name:m[1],text:m[2],tier});
  }
  return out;
}

const TALENTS=parseTalents();
for(const s of SCHOOL_ORDER){
  if(!TALENTS[s] || TALENTS[s].length!==3 || TALENTS[s].some(b=>b.length!==6)) throw new Error(`天赋结构错误: ${s}`);
}
const ALL_TALENTS=new Set(Object.values(TALENTS).flat(2).map(x=>x.name));
if(ALL_TALENTS.size!==180) throw new Error(`天赋应为180，实际${ALL_TALENTS.size}`);
const categorized=new Set(Object.values(CATEGORIES).flatMap(x=>[...x]));
const uncategorized=[...ALL_TALENTS].filter(x=>!categorized.has(x));
if(uncategorized.length) throw new Error(`未建立模拟画像: ${uncategorized.join('、')}`);

function choices(branch,k){
  if(k===0)return [[]]; if(k===1)return [[branch[0]],[branch[1]]]; if(k===2)return [[branch[0],branch[1]]];
  if(k===3)return [[branch[0],branch[1],branch[2]],[branch[0],branch[1],branch[3]]];
  if(k===4)return [[branch[0],branch[1],branch[2],branch[3]]];
  if(k===5)return [[branch[0],branch[1],branch[2],branch[3],branch[4]]];
  return [[...branch]];
}
function buildsFor(school){
  const bs=TALENTS[school]; const out=[];
  for(let a=0;a<=6;a++)for(let b=0;b<=6;b++)for(let c=0;c<=6;c++){
    if(a+b+c!==10 || [a,b,c].filter(x=>x===6).length>1)continue;
    for(const x of choices(bs[0],a))for(const y of choices(bs[1],b))for(const z of choices(bs[2],c))
      out.push({school,split:[a,b,c],talents:[...x,...y,...z]});
  }
  if(out.length!==75)throw new Error(`${school} 构筑应为75，实际${out.length}`);
  return out;
}
const BUILDS=SCHOOL_ORDER.flatMap(buildsFor);

function rng(seed){ let x=seed|0; return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;}; }
function hash(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function has(f,n){return f.talents.has(n);}
function cat(f,k){let n=0;for(const t of f.talents)if(CATEGORIES[k].has(t))n++;return n;}
function tierWeight(f,k){let n=0;for(const b of TALENTS[f.school])for(const t of b)if(f.talents.has(t.name)&&CATEGORIES[k].has(t.name)){n += [0,.012,.02,.032,.05][t.tier];f.triggered.add(t.name);}return n;}

function fighter(build,side){
  const f={school:build.school,build,side,maxHp:1200,hp:1200,maxMp:100,mp:100,atk:112,def:42,
    hit:.95,crit:.08,critMult:1.45,dodge:0,shield:0,guard:0,resource:0,resource2:0,maxResource:3,
    talents:new Set(build.talents.map(x=>x.name)),cd:[0,0,0,0,0],ultimate:false,status:{},counters:{},
    totalDamage:0,totalHeal:0,triggered:new Set(),evaluated:new Set(build.talents.map(x=>x.name))};
  if(f.school==='峨眉派')f.maxResource=4;
  if(f.school==='影之忍宗')f.maxResource=4;
  if(f.school==='北海战团')f.maxResource=100;
  if(has(f,'举盾')){f.resource=1;f.triggered.add('举盾');}
  if(has(f,'战斗配方')){f.counters.material=3;f.triggered.add('战斗配方');}
  if(has(f,'潜行'))f.status.stealth=1;
  return f;
}
function addRes(f,n){
  for(const t of f.talents)if(CATEGORIES.resource.has(t))f.triggered.add(t);
  const before=f.resource;
  if(f.school==='北海战团')f.resource=Math.min(100,f.resource+n); else f.resource=Math.min(f.maxResource,f.resource+n);
  return f.resource-before;
}
function spendRes(f,n){const x=Math.min(f.resource,n);f.resource-=x;return x;}
function available(f,i){return !f.cd[i] && f.mp+1e-9>=SKILLS[f.school][i][2]*f.maxMp && !(i===4&&f.ultimate);}
function decide(f,e,round){
  const survivalLine={少林寺:.50,武当派:.45,峨眉派:.50,奥术学院:.50,太阳神殿:.50}[f.school]||.42;
  if(f.hp/f.maxHp<survivalLine && available(f,3))return 3;
  let ultReady=f.resource>=Math.min(3,f.maxResource);
  if(f.school==='北海战团')ultReady=f.resource>=40;
  if(f.school==='丐帮')ultReady=(e.counters.flaw||0)>=3;
  if(f.school==='奥术学院')ultReady=(e.counters.elementMarks||0)>=3;
  if(f.school==='影之忍宗')ultReady=(e.counters.assassinMarks||0)>=4;
  if(f.school==='太阳神殿')ultReady=f.resource>=3||(e.counters.sun||0)>=3;
  if(available(f,4) && (ultReady || round>=12 || f.hp/f.maxHp<.3))return 4;
  if(available(f,2) && (round%4===0 || e.status.cast || e.guard>.05 || e.shield>0))return 2;
  if(available(f,1) && (f.resource>0 || round%2===0))return 1;
  if(available(f,0))return 0;
  return -1;
}
function statusTick(f){
  for(const k of Object.keys(f.status))if(typeof f.status[k]==='number'&&f.status[k]>0){f.status[k]--;if(f.status[k]<=0)delete f.status[k];}
}
function heal(f,amount){
  let mult=1+tierWeight(f,'sustain');
  if(f.status.grievous)mult*=.7;
  const actual=Math.max(0,Math.min(f.maxHp-f.hp,amount*mult));f.hp+=actual;f.totalHeal+=actual;return actual;
}
function setTriggered(f,n){if(has(f,n))f.triggered.add(n);}

function consumeAfterimage(defender,attacker){
  if((defender.counters.afterimage||0)<=0)return false;
  defender.counters.afterimage--;
  setTriggered(defender,'残影');
  if(has(defender,'虚实相生')){
    attacker.counters.assassinMarks=Math.min(4,(attacker.counters.assassinMarks||0)+1);
    setTriggered(defender,'虚实相生');
  }
  return true;
}

function extraAttack(f,e,power,baseDamage){
  if(consumeAfterimage(e,f))return 0;
  let dmg=baseDamage==null
    ? f.atk*power*100/(100+e.def*(e.status.armorBreak?.92:1))
    : baseDamage;
  dmg*=1-Math.min(.55,tierWeight(e,'defense'));
  if(e.shield>0){const absorbed=Math.min(e.shield,dmg);e.shield-=absorbed;dmg-=absorbed;}
  dmg=Math.max(0,dmg);e.hp-=dmg;f.totalDamage+=dmg;return dmg;
}

function schoolBefore(f,e,skill,i,round,ctx){
  const s=f.school;
  if(has(f,'寒星一点') && !f.counters.firstSword && skill[4].includes('weapon')){ctx.hit+=.10;f.counters.firstSword=1;setTriggered(f,'寒星一点');}
  if(has(f,'夺先')&&round===1){ctx.damage*=1.15;setTriggered(f,'夺先');}
  if(has(f,'剑到人亡')&&e.hp/e.maxHp<.3){ctx.crit+=.15;setTriggered(f,'剑到人亡');}
  if(has(f,'潜行')&&!f.counters.stealthUsed){ctx.damage*=1.08;f.counters.stealthUsed=1;setTriggered(f,'潜行');}
  if(has(f,'处决窗口')&&(e.status.unbalanced||e.status.silenced||e.status.cast)){ctx.damage*=1.15;setTriggered(f,'处决窗口');}
  if(has(f,'长枪架势')&&(e.status.cast||e.status.healing)){ctx.damage*=1.10;setTriggered(f,'长枪架势');}
  if(has(f,'荣誉誓言')){if(f.hp/f.maxHp<e.hp/e.maxHp)ctx.heal*=1.10;setTriggered(f,'荣誉誓言');}
  if(has(f,'怜悯誓言')&&e.hp/e.maxHp<.3){ctx.damage*=.95;ctx.postHeal+=f.maxHp*.03;setTriggered(f,'怜悯誓言');}
  if(has(f,'向死而战')){const stacks=Math.min(9,Math.floor((1-f.hp/f.maxHp)*10));ctx.damage*=1+stacks*.03;ctx.heal*=1-stacks*.02;setTriggered(f,'向死而战');}
  if(has(f,'血染战意')&&f.hp/f.maxHp<.5){ctx.cost*=.85;setTriggered(f,'血染战意');}
  if(has(f,'重斧专精')&&skill[4].includes('heavy')&&e.shield>0){ctx.shieldDamage*=1.15;setTriggered(f,'重斧专精');}
  if(has(f,'心脏天平')&&skill[4].includes('dot')){ctx.damage*=1+Math.min(3,Object.keys(e.status).length)*.05;setTriggered(f,'心脏天平');}
  if(has(f,'烟幕')&&f.status.evade){ctx.damage*=.95;setTriggered(f,'烟幕');}
  if(has(f,'气沉丹田')&&f.mp/f.maxMp>.7)setTriggered(f,'气沉丹田');
  if(has(f,'伏虎劲')&&f.guard>0){ctx.damage*=1+(f.def*.15/f.atk);setTriggered(f,'伏虎劲');}
  if(has(f,'以守为攻')&&f.guard>0&&skill[4].includes('fist')){ctx.damage*=1.08;setTriggered(f,'以守为攻');}
  if(has(f,'处决窗口')&&s==='影之忍宗'&&e.resource>0){ctx.damage*=1.02;}
}

function schoolSkill(f,e,skill,i,round,ctx){
  const s=f.school;
  if(s==='少林寺'){
    if(i===0&&f.guard>0)addRes(f,1);
    if(i===1){const n=spendRes(f,2);ctx.pierce+=n*.05;}
    if(i===2){ctx.control=.40;if(e.status.cast)ctx.interrupt=1;}
    if(i===3){ctx.postHeal+=f.maxHp*.05;ctx.postMp+=5;f.guard=Math.max(f.guard,.08);addRes(f,1);}
    if(i===4){const n=spendRes(f,f.resource);f.guard=Math.max(f.guard,.08);f.shield+=f.maxHp*.03*n;}
    if(has(f,'金刚怒目')&&f.resource>=3&&i!==3){spendRes(f,3);ctx.pierce+=.20;ctx.applyUnbalance=1;setTriggered(f,'金刚怒目');}
    if(has(f,'步步生莲')&&e.status.unbalanced){ctx.postMp+=5;setTriggered(f,'步步生莲');}
  } else if(s==='武当派'){
    if(i===0){if((f.counters.stance||0)%2===0)addRes(f,1);else f.resource2=Math.min(3,f.resource2+1);f.counters.stance=(f.counters.stance||0)+1;}
    if(i===1){const n=spendRes(f,2);ctx.damage*=1+n*.04;f.resource2=Math.min(3,f.resource2+n);}
    if(i===2){f.guard=Math.max(f.guard,.10);f.status.counter=1;addRes(f,1);ctx.applyUnbalance=1;}
    if(i===3){f.guard=Math.max(f.guard,.10);ctx.postMp-=Math.min(8,f.mp);f.status.mpShield=1;}
    if(i===4){const pairs=Math.min(3,f.resource,f.resource2);spendRes(f,pairs);f.resource2-=pairs;ctx.power+=pairs*.10;}
    if(has(f,'阴阳轮转')&&f.resource2){ctx.damage*=1+f.resource2*.04;f.resource2=0;setTriggered(f,'阴阳轮转');}
    if(has(f,'七截共鸣')&&skill[4].includes('weapon')){ctx.power+=Math.min(3,f.counters.eyes||0)*.05;setTriggered(f,'七截共鸣');}
  } else if(s==='峨眉派'){
    if(i===0){addRes(f,1);f.counters.acu=Math.min(3,(f.counters.acu||0)+1);}
    if(i===1){ctx.damage*=1+f.resource*.012;}
    if(i===2&&f.counters.acu>=3){f.counters.acu=0;ctx.control=.40;}
    if(i===3){ctx.postHeal+=f.maxHp*.06;f.shield+=f.maxHp*.04;}
    if(i===4){const n=spendRes(f,f.resource);ctx.power+=n*.05;ctx.hit=Math.max(ctx.hit, n===4?1:ctx.hit);}
    if(has(f,'流风回雪')&&skill[4].includes('multi')){ctx.damage*=1+f.resource*.01;setTriggered(f,'流风回雪');}
    if(has(f,'飘雪无尽')&&f.resource>=4){ctx.power+=.20;spendRes(f,4);setTriggered(f,'飘雪无尽');}
    if(has(f,'佛光护体')&&i===3){f.shield+=ctx.postHeal*.10;setTriggered(f,'佛光护体');}
  } else if(s==='丐帮'){
    const flaw=e.counters.flaw||0;
    if(i===0){e.counters.flaw=Math.min(3,flaw+1);setTriggered(f,'亢龙势');if(has(f,'缠字诀')){e.status.entangle=1;setTriggered(f,'缠字诀');}}
    if(i===1){ctx.pierce+=flaw*.04;if(flaw>0&&!has(f,'见龙在田'))e.counters.flaw--;}
    if(i===2){ctx.interrupt=e.status.cast?1:0;ctx.applyUnbalance=!ctx.interrupt;}
    if(i===3){f.status.evade=1;ctx.dodge+=.10;}
    if(i===4){const n=e.counters.flaw||0;e.counters.flaw=0;ctx.power+=n*.08;if(has(f,'龙战于野')){ctx.pierce+=.08;ctx.damage*=1+(1-e.hp/e.maxHp)*.10;setTriggered(f,'龙战于野');}}
    if(has(f,'掌裂山河')&&ctx.pierce>0){ctx.pierce+=(e.counters.flaw||0)*.05;setTriggered(f,'掌裂山河');}
  } else if(s==='华山派'){
    if(i===0)addRes(f,1);
    if(i===1&&f.resource){spendRes(f,1);ctx.power+=.18;}
    if(i===2){if(e.guard||e.shield)ctx.pierce+=has(f,'无招胜有招')?.15:.08;else ctx.hit+=has(f,'无招胜有招')?.20:.15;}
    if(i===3){ctx.postMp+=10;f.guard=Math.max(f.guard,.08);if(f.mp/f.maxMp>.7)addRes(f,1);}
    if(i===4){const n=spendRes(f,f.resource);ctx.hit=1;ctx.critMult+=n*.08;}
    if(has(f,'狂风快剑')&&skill[4].includes('weapon')&&!skill[4].includes('multi')&&f.resource){spendRes(f,1);ctx.power+=ctx.power*.10;setTriggered(f,'狂风快剑');}
  } else if(s==='奥术学院'){
    if(i===0){e.counters.elementMarks=Math.min(has(f,'大法师共鸣')?6:3,(e.counters.elementMarks||0)+1);f.counters.element=((f.counters.element||0)+1)%3;setTriggered(f,'大法师共鸣');if(has(f,'元素催化剂')&&(f.counters.material||0)>0){f.counters.material--;setTriggered(f,'元素催化剂');}}
    if(i===1){const kinds=Math.min(3,e.counters.elementMarks||0);e.counters.elementMarks=Math.max(0,(e.counters.elementMarks||0)-3);ctx.power+=kinds*(has(f,'雷霆传导')?.15:.10);}
    if(i===2){f.status.counterspell=1;}
    if(i===3){ctx.postHeal+=f.maxHp*.05;if(!e.status.dot)ctx.postMp+=8;}
    if(i===4){const n=Math.min(3,e.counters.elementMarks||0);e.counters.elementMarks=0;ctx.power+=n*.10;if(n===3)ctx.applyUnbalance=1;}
    if(has(f,'元素轮转')&&i===0){f.counters.rotation=(f.counters.rotation||0)+1;if(f.counters.rotation===3){ctx.postMp+=ctx.cost*3*.30;f.counters.rotation=0;setTriggered(f,'元素轮转');}}
  } else if(s==='王冠骑士团'){
    if(i===0&&f.counters.blocked){if(has(f,'盾牌反击')){ctx.power+=.10;setTriggered(f,'盾牌反击');}addRes(f,1);f.counters.blocked=0;}
    if(i===1){if(f.resource){spendRes(f,1);ctx.pierce+=.15;}if(f.status.charge){ctx.pierce+=has(f,'骑枪贯穿')?.20:0;ctx.applyUnbalance=1;delete f.status.charge;}}
    if(i===2){f.status.charge=2;ctx.applyUnbalance=1;}
    if(i===3){f.shield+=f.maxHp*.035;addRes(f,1);}
    if(i===4){f.resource=3;f.status.wall=2;}
    if(has(f,'长枪架势')&&(e.status.cast||e.status.healing)){ctx.damage*=1.10;setTriggered(f,'长枪架势');}
    if(has(f,'破阵枪')&&i===1&&f.resource){const n=spendRes(f,f.resource);ctx.power+=n*.08;e.guard=0;setTriggered(f,'破阵枪');}
  } else if(s==='影之忍宗'){
    if(i===0)e.counters.assassinMarks=Math.min(4,(e.counters.assassinMarks||0)+1);
    if(i===1){e.counters.assassinMarks=Math.min(4,(e.counters.assassinMarks||0)+1);e.status.dot=3;e.status.poisonPower=.004;}
    if(i===2){if(e.status.dot){ctx.dotBurst=(e.status.dot||0)*(e.status.poisonPower||0)*e.maxHp*(has(f,'爆毒')?1.10:1);delete e.status.dot;}else e.counters.assassinMarks=Math.min(4,(e.counters.assassinMarks||0)+2);}
    if(i===3){f.status.evade=1;ctx.dodge+=.10;}
    if(i===4){const n=e.counters.assassinMarks||0;e.counters.assassinMarks=0;ctx.power+=n*.08;if(has(f,'一闪绝命'))ctx.damage*=1+(1-e.hp/e.maxHp)*.10;}
    if(has(f,'混毒')&&skill[4].includes('dot')){ctx.dotMult*=1.20;setTriggered(f,'混毒');}
    if(has(f,'月下追影')&&(e.counters.assassinMarks||0)>=2&&i===4){e.counters.assassinMarks-=2;ctx.hit=1;ctx.crit=Math.max(0,ctx.crit-.10);setTriggered(f,'月下追影');}
  } else if(s==='北海战团'){
    if(i===0)addRes(f,f.hp/f.maxHp<.5?16:12);
    if(i===1&&f.resource>=20){spendRes(f,20);e.status.armorBreak=2;}
    if(i===2){ctx.interrupt=e.status.cast?1:0;ctx.applyUnbalance=!ctx.interrupt;f.status.slow=1;}
    if(i===3){addRes(f,20);ctx.postHeal+=f.maxHp*.05;}
    if(i===4){const rage=f.resource;spendRes(f,rage);if(has(f,'诸神黄昏'))ctx.power=[1.23,1.41,1.59][rage<40?0:rage<80?1:2];f.status.weak=1;}
    if(has(f,'雪崩之势')&&skill[4].includes('heavy')){const n=f.counters.avalanche||0;ctx.damage*=1+n*.05;f.counters.avalanche=Math.min(3,n+1);setTriggered(f,'雪崩之势');}
  } else if(s==='太阳神殿'){
    if(i===0){e.counters.sun=Math.min(3,(e.counters.sun||0)+1);e.status.sun=2;}
    if(i===1){e.status.dot=3;e.status.poisonPower=.003;e.status.curse=3;}
    if(i===2){const n=e.counters.sun||0;e.counters.sun=0;ctx.power+=n*.05*.75;addRes(f,Math.floor(n/2));}
    if(i===3){ctx.postHeal+=f.maxHp*.05;f.shield+=f.maxHp*.05;addRes(f,1);}
    if(i===4){const o=spendRes(f,f.resource),sun=e.counters.sun||0;e.counters.sun=0;ctx.power+=o*.08+sun*.06;if(has(f,'太阳审判')&&o===3)ctx.pierce+=.20;}
    if(has(f,'沙海恶咒')&&i===1){e.status.attackDown=3;setTriggered(f,'沙海恶咒');}
  }
}

function act(f,e,i,round,R){
  const skill=i<0?['普通拳脚',.60,0,0,['fist'],'fallback']:SKILLS[f.school][i];
  const ctx={power:skill[1],cost:skill[2]*f.maxMp,hit:f.hit,crit:f.crit,critMult:f.critMult,damage:1,
    heal:1,pierce:0,control:0,interrupt:0,applyUnbalance:0,postHeal:0,postMp:0,dodge:0,shieldDamage:1,dotMult:1,dotBurst:0};
  ctx.damage*=1+tierWeight(f,'offense');ctx.hit+=tierWeight(f,'control')*.35;ctx.heal*=1+tierWeight(f,'sustain');
  schoolBefore(f,e,skill,i,round,ctx);if(i>=0)schoolSkill(f,e,skill,i,round,ctx);
  if(e.status.entangle&&skill[4].includes('weapon')){ctx.damage*=.90;delete e.status.entangle;}
  if(f.status.weak)ctx.damage*=.90;
  f.mp=Math.max(0,f.mp-ctx.cost); if(i>0&&i<4)f.cd[i]=skill[3]+1;
  if(i===4){f.ultimate=true;f.cd[4]=99;}
  const hitChance=Math.max(.05,Math.min(1,ctx.hit-(e.status.evade?.10:0)-e.dodge));
  const hit=R()<hitChance;
  if(hit){
    const crit=R()<ctx.crit;let raw=f.atk*ctx.power*(crit?ctx.critMult:1)*ctx.damage;
    let defense=e.def*(e.status.armorBreak?.92:1);let dmg=raw*100/(100+defense*(1-Math.min(.8,ctx.pierce)));
    dmg*=1-Math.min(.55,tierWeight(e,'defense'));
    if(e.guard){dmg*=1-e.guard;e.guard=0;}
    if(e.status.mpShield&&e.mp>=6){e.mp-=6;dmg*=.92;delete e.status.mpShield;}
    if(e.status.weak)dmg*=1;
    if(e.shield>0){const absorbed=Math.min(e.shield,dmg*ctx.shieldDamage);e.shield-=absorbed;dmg-=absorbed/ctx.shieldDamage;}
    if(e.school==='王冠骑士团'&&e.resource>0&&dmg>0){spendRes(e,1);dmg=Math.max(0,dmg-e.maxHp*.01);if(e.status.wall)e.shield+=e.maxHp*.01;e.counters.blocked=1;}
    dmg=Math.max(0,dmg);e.hp-=dmg;f.totalDamage+=dmg;
    if(e.status.counter&&dmg>0){const counter=dmg*.20;f.hp-=counter;e.totalDamage+=counter;delete e.status.counter;setTriggered(e,'借力还力');}
    if(f.school==='峨眉派'&&has(f,'连环不绝')&&skill[4].includes('multi')&&f.resource>=3&&(f.counters.chainRound||0)+3<=round){
      spendRes(f,1);f.counters.chainRound=round;extraAttack(f,e,0,dmg*.05);setTriggered(f,'连环不绝');
    }
    if(f.school==='影之忍宗'&&has(f,'影分身')&&(f.counters.afterimage||0)>=2){
      extraAttack(f,e,.16);setTriggered(f,'影分身');
    }
    if(ctx.dotBurst){e.hp-=ctx.dotBurst;f.totalDamage+=ctx.dotBurst;}
    if(ctx.applyUnbalance)e.status.unbalanced=1;
    if(ctx.control&&R()<ctx.control)e.status.stunned=1;
    if(ctx.postHeal)heal(f,ctx.postHeal*ctx.heal);
    if(ctx.postMp)f.mp=Math.max(0,Math.min(f.maxMp,f.mp+ctx.postMp));
    if(f.school==='峨眉派'&&has(f,'踏雪无痕')&&ctx.power>skill[1]){addRes(f,1);setTriggered(f,'踏雪无痕');}
    if(f.school==='影之忍宗'&&has(f,'嗅血')&&e.hp/e.maxHp<.4){e.counters.assassinMarks=Math.min(4,(e.counters.assassinMarks||0)+1);setTriggered(f,'嗅血');}
  } else {
    if(has(e,'残影')){e.counters.afterimage=Math.min(2,(e.counters.afterimage||0)+1);setTriggered(e,'残影');}
    if(f.school==='峨眉派'&&f.resource>0&&!has(f,'雪影回旋'))f.resource--;
    if(f.school==='峨眉派'&&has(f,'雪影回旋'))setTriggered(f,'雪影回旋');
    if(f.school==='丐帮'&&has(f,'酒中藏招')){f.counters.drunk=Math.min(3,(f.counters.drunk||0)+1);setTriggered(f,'酒中藏招');}
    if(f.school==='影之忍宗'&&has(f,'苦无试探')&&i===0){e.counters.assassinMarks=Math.min(4,(e.counters.assassinMarks||0)+1);setTriggered(f,'苦无试探');}
    if(f.school==='北海战团'&&has(f,'横扫')&&skill[4].includes('heavy')){e.status.unbalanced=1;setTriggered(f,'横扫');}
  }
  if(f.school==='少林寺'&&has(f,'伏魔循环'))setTriggered(f,'伏魔循环');
}

function roundEnd(f,e,round){
  if(f.status.stunned){/* consumed at next action */}
  if(f.status.dot&&f.status.poisonPower){let d=f.maxHp*f.status.poisonPower*(1+tierWeight(e,'offense'));f.hp-=d;e.totalDamage+=d;}
  if(f.status.sun){let d=e.atk*.05*100/(100+f.def);f.hp-=d;e.totalDamage+=d;if(--f.status.sun<=0){delete f.status.sun;addRes(e,1);}}
  if(has(f,'抱元守一')&&round%3===0){f.mp=Math.min(100,f.mp+2);setTriggered(f,'抱元守一');}
  if(has(f,'紫霞初升')&&f.mp>70){addRes(f,1);setTriggered(f,'紫霞初升');}
  if(has(f,'不落壁垒')&&round%3===0&&!f.status.armorBreak){addRes(f,1);setTriggered(f,'不落壁垒');}
  if(has(f,'回风拂柳')&&round%6===0&&f.hp<f.maxHp){heal(f,f.maxHp*.005);setTriggered(f,'回风拂柳');}
  if(has(f,'佛光普照')&&f.hp/f.maxHp<.2){heal(f,f.maxHp*.005);setTriggered(f,'佛光普照');}
  if(has(f,'英灵合唱')&&(f.counters.song||0)>=3){heal(f,f.maxHp*.01);setTriggered(f,'英灵合唱');}
  f.mp=Math.min(f.maxMp,f.mp+2);
  for(let i=0;i<4;i++)if(f.cd[i]>0)f.cd[i]--;
  statusTick(f);
}

function fight(aBuild,bBuild,seed){
  const R=rng(seed),a=fighter(aBuild,0),b=fighter(bBuild,1);let round=0;
  for(round=1;round<=MAX_ROUNDS&&a.hp>0&&b.hp>0;round++){
    const order=R()<.5?[a,b]:[b,a];
    for(const f of order){const e=f===a?b:a;if(f.hp<=0||e.hp<=0)break;
      if(f.status.stunned){delete f.status.stunned;continue;}
      const i=decide(f,e,round);act(f,e,i,round,R);
      if(f.hp/f.maxHp<.2&&has(f,'达摩渡厄')&&!f.counters.daruma){f.counters.daruma=1;heal(f,f.maxHp*.08);f.status={};setTriggered(f,'达摩渡厄');}
      if(f.hp<=0&&has(f,'不坏法身')&&f.resource>0&&!f.counters.revive){f.counters.revive=1;f.resource=0;f.hp=1;f.guard=.08;setTriggered(f,'不坏法身');}
    }
    roundEnd(a,b,round);roundEnd(b,a,round);
  }
  const score=a.hp<=0&&b.hp<=0?.5:a.hp<=0?0:b.hp<=0?1:a.hp/a.maxHp===b.hp/b.maxHp?.5:a.hp/a.maxHp>b.hp/b.maxHp?1:0;
  return {score,rounds:Math.min(round,MAX_ROUNDS),a,b};
}

function aggregate(){
  const schoolStats=Object.fromEntries(SCHOOL_ORDER.map(s=>[s,{score:0,games:0,rounds:0}]));
  const matchup={};const buildStats=new Map();const triggerCounts=Object.fromEntries([...ALL_TALENTS].map(x=>[x,0]));
  let games=0,totalRounds=0;
  for(let i=0;i<BUILDS.length;i++)for(let j=i+1;j<BUILDS.length;j++){
    const A=BUILDS[i],B=BUILDS[j];
    for(let r=0;r<REPEATS;r++){
      const out=fight(A,B,SEED^hash(`${i}:${j}:${r}`));games++;totalRounds+=out.rounds;
      schoolStats[A.school].score+=out.score;schoolStats[A.school].games++;schoolStats[A.school].rounds+=out.rounds;
      schoolStats[B.school].score+=1-out.score;schoolStats[B.school].games++;schoolStats[B.school].rounds+=out.rounds;
      const key=[A.school,B.school].join('|');const m=matchup[key]||(matchup[key]={a:A.school,b:B.school,score:0,games:0});m.score+=out.score;m.games++;
      for(const f of [out.a,out.b])for(const t of f.triggered)triggerCounts[t]++;
      for(const [build,score] of [[A,out.score],[B,1-out.score]]){const names=build.talents.map(x=>x.name);const k=`${build.school}:${build.split.join('-')}:${names.join(',')}`;const x=buildStats.get(k)||{school:build.school,split:build.split,talents:names,score:0,games:0};x.score+=score;x.games++;buildStats.set(k,x);}
    }
  }
  const schools=Object.entries(schoolStats).map(([school,x])=>({school,winRate:x.score/x.games,games:x.games,avgRounds:x.rounds/x.games}));
  const matchups=Object.values(matchup).map(x=>({...x,winRate:x.score/x.games}));
  const builds=[...buildStats.values()].map(x=>({...x,winRate:x.score/x.games})).sort((a,b)=>a.winRate-b.winRate);
  const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(TALENT_DOC)).update(fs.readFileSync(ACTIVE_DOC)).digest('hex');
  return {version:'0.5',seed:SEED,repeats:REPEATS,sourceHash,builds:BUILDS.length,games,avgRounds:totalRounds/games,
    schools,matchups,buildResults:builds,buildExtremes:{lowest:builds.slice(0,10),highest:builds.slice(-10).reverse()},
    talentCoverage:{total:ALL_TALENTS.size,modeled:categorized.size,triggered:Object.values(triggerCounts).filter(Boolean).length,neverTriggered:Object.entries(triggerCounts).filter(([,v])=>!v).map(([k])=>k),triggerCounts}};
}

const result=aggregate();
fs.writeFileSync(RESULT_FILE,JSON.stringify(result,null,2)+'\n');
console.log(`v${result.version} seed=${result.seed} repeats=${result.repeats}`);
console.log(`builds=${result.builds} games=${result.games} avgRounds=${result.avgRounds.toFixed(2)}`);
for(const x of result.schools.sort((a,b)=>a.winRate-b.winRate))console.log(`${x.school.padEnd(8)} ${(x.winRate*100).toFixed(2)}%`);
console.log(`talents modeled=${result.talentCoverage.modeled}/${result.talentCoverage.total} triggered=${result.talentCoverage.triggered}/${result.talentCoverage.total}`);
if(result.talentCoverage.neverTriggered.length)console.log(`neverTriggered=${result.talentCoverage.neverTriggered.join('、')}`);

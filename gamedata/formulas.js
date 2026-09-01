/* 数值公式：升级、气血内力、攻防、闪避暴击、泡点、打造。
   调平衡只该改这个文件。 */

/*#node*/ const { WEAPONS, ARMORS, MATS, DROP, PRICE } = require("./items.js");
/*#node*/ const { TITLES } = require("./flavor.js");

const F = {
  need : lv => Math.floor(60*Math.pow(lv,1.75)+40*lv),
  maxHp: p => 60 + p.root*14 + p.lv*16,
  maxMp: p => 30 + p.mind*10 + p.lv*8,
  atk  : p => 6 + p.str*2.2 + p.lv*1.6 + WEAPONS[p.weapon].atk * F.forge(p.wLv||0),
  def  : p => 2 + p.root*0.8 + p.lv*0.9 + ARMORS[p.armor].def * F.forge(p.aLv||0),
  // 打造：一件东西从 +n 打到 +n+1 的花费、成功率；每级加一成二属性
  forge    : n => 1 + 0.12*n,
  forgeCost: (base, n) => Math.floor((base||100)*0.6*(n+1) + 200*(n+1)),
  forgeRate: n => Math.max(.15, .95 - n*0.09),
  forgeMax : 9,
  // 打到 +5 之前使精铁，往上非玄晶不可
  forgeMat : n => n < 4 ? {k:'jing', n:n+1} : {k:'xuan', n:n-2},
  bagMax   : 12,
  dodge: p => Math.min(.35, p.agi*.008),
  crit : p => Math.min(.4, .03 + p.agi*.005),
  // 泡点：每 2 秒一跳能得多少经验（等级超出场地推荐值越多衰减越狠，最低两成半）
  idleTick: (p, pd) => pd.exp * Math.max(.25, 1 - Math.max(0, p.lv-pd.lv)*0.035) * (1 + p.mind*0.02),
};


const titleOf = lv => { let t='初入江湖'; for(const [n,s] of TITLES) if(lv>=n) t=s; return t; };

const plus = n => n>0 ? '+'+n : '';

/*#node*/ module.exports = { F, titleOf, plus };

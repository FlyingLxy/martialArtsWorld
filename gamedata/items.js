/* 装备与材料：兵器、护体、打造材料、掉落规则、各处价格。 */

const WEAPONS = [
  {name:'空手',     atk:0,  price:0},    {name:'木棍',       atk:4,  price:30},
  {name:'铁剑',     atk:11, price:180},  {name:'雁翎刀',     atk:22, price:700},
  {name:'精钢长剑', atk:38, price:2200}, {name:'玄铁重剑',   atk:66, price:8000},
  {name:'倚天古剑', atk:110,price:30000},
  {name:'屠龙宝刀', atk:170,price:90000},
];
const ARMORS = [
  {name:'粗布衣',   def:0,  price:0},    {name:'皮甲',       def:3,  price:40},
  {name:'锁子甲',   def:9,  price:220},  {name:'乌金锁甲',   def:18, price:900},
  {name:'金丝软猬甲',def:32, price:3000}, {name:'天蚕宝衣',  def:55, price:12000},
];


/* 打造用的材料，从怪身上掉 */
const MATS = {
  jing: {name:'精铁',   tip:'打造 +1 到 +4 用得上'},
  xuan: {name:'玄晶',   tip:'打造 +5 往上非它不可'},
};

/* 掉落：按怪的等级决定能掉什么档次的东西 */
const DROP = {
  tier: lv => lv<10 ? 1 : lv<18 ? 2 : lv<26 ? 3 : lv<34 ? 4 : lv<45 ? 5 : lv<55 ? 6 : 7,
  equipRate: 0.12,       // 一成二的机会掉件装备
  jingRate : 0.35,       // 精铁常见
  xuanRate : lv => lv>=20 ? 0.10 : 0,   // 玄晶只有硬点子身上才有
};

/* 花钱的地方：银两唯一的出路 */
const PRICE = {
  flower  : 120,     // 一朵花
  treat   : 60,      // 请客，按屋里人头算
  betrothal: 8000,   // 聘礼
  wedding : 20000,   // 摆喜宴（全服同喜）
  divorce : 2000,    // 和离
  stallTax: 0.10,    // 寄卖成交抽头，这笔钱凭空消失
  pkRake  : 0.10,    // 押注切磋的彩头抽成
};

/*#node*/ module.exports = { WEAPONS, ARMORS, MATS, DROP, PRICE };

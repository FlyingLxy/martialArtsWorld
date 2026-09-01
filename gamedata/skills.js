/* 武功：门派武学与效果。加招式、调威力改这里。 */

/* 武功：lv 门槛 / 束脩 / 内力 / 倍率 / 特色效果
   eff 里的花样：guard 护体减伤　reflect 反弹　double 连击　pierce 破防
                sure 必中　crit 暴击　drain 吸血　stun 定身　heal 回血　mp 回内力　dodge 闪避 */
const SKILLS = {
  pugong:  {name:'寻常拳脚', sect:null, lv:1, cost:0, mp:0, mult:1.0, txt:'一记直拳'},

  /* ── 少林：硬打硬挨，越打越结实 ── */
  luohan:  {name:'罗汉拳',   sect:'shaolin', lv:3,  cost:50,   mp:4,  mult:1.5, txt:'罗汉拳势沉如山'},
  jinzhong:{name:'金钟罩',   sect:'shaolin', lv:8,  cost:200,  mp:8,  mult:0.8, txt:'周身一震，罩起金钟',
            eff:{guard:.5, turns:2}, note:'两回合内受伤减半'},
  weituo:  {name:'韦陀掌',   sect:'shaolin', lv:15, cost:600,  mp:11, mult:2.3, txt:'韦陀献杵，掌风轰然'},
  shizi:   {name:'狮子吼',   sect:'shaolin', lv:22, cost:1400, mp:16, mult:1.6, txt:'一声狮子吼震得对手耳鸣',
            eff:{stun:.35}, note:'三成半机会震得对方下回合动不了'},
  yijin:   {name:'易筋经',   sect:'shaolin', lv:30, cost:3000, mp:24, mult:3.6, txt:'易筋经真气鼓荡',
            eff:{heal:.12}, note:'伤敌之余回一成二气血'},
  duoe:    {name:'达摩渡厄',  sect:'shaolin', lv:40, gang:300,  mp:34, mult:4.5, txt:'一掌拍出，梵音大作',
            eff:{guard:.4, turns:2, heal:.15}, note:'绝学 · 减伤又回血'},
  longzhua:{name:'龙爪手',   sect:'shaolin', lv:48, cost:20000, mp:42, mult:5.2, txt:'五指如钩，抓向对方肩井',
            eff:{pierce:.55, stun:.25}, note:'破防，还有机会震住对方'},
  jingang:{name:'大力金刚指',sect:'shaolin', lv:60, gang:600,   mp:52, mult:6.5, txt:'一指点出，空气都嗡嗡作响',
            eff:{guard:.45, turns:2, heal:.15, crit:.2}, note:'镇派绝技 · 减伤、回血、易暴击'},

  /* ── 武当：以柔克刚，借力打力 ── */
  taiji:   {name:'太极拳',   sect:'wudang', lv:3,  cost:50,   mp:3,  mult:1.4, txt:'太极圆转，四两拨千斤',
            eff:{reflect:.3}, note:'把挨的伤三成还回去'},
  tiyun:   {name:'梯云纵',   sect:'wudang', lv:8,  cost:200,  mp:7,  mult:1.8, txt:'身形拔起，凌空一击',
            eff:{dodge:.3, turns:2}, note:'两回合内更难被打中'},
  liangyi: {name:'两仪剑法', sect:'wudang', lv:15, cost:600,  mp:10, mult:2.3, txt:'两仪生四象，剑走轻灵'},
  taijijian:{name:'太极剑',  sect:'wudang', lv:22, cost:1400, mp:15, mult:2.8, txt:'剑随意走，绵绵不绝',
            eff:{reflect:.5}, note:'把挨的伤一半还回去'},
  chunyang:{name:'纯阳无极功',sect:'wudang', lv:30, cost:3000, mp:22, mult:3.5, txt:'纯阳真气破空而出',
            eff:{mp:.2}, note:'出招反倒涨两成内力'},
  zhenwu:  {name:'真武七截阵',sect:'wudang', lv:40, gang:300,  mp:32, mult:4.4, txt:'剑影如阵，七截连环',
            eff:{reflect:.5, double:.4}, note:'绝学 · 反弹加连击'},
  raozhi:{name:'绕指柔剑', sect:'wudang', lv:48, cost:20000, mp:40, mult:5.0, txt:'长剑忽软如绸，缠了上去',
            eff:{reflect:.6, dodge:.25, turns:2}, note:'重反弹，还更难被打中'},
  xuanqing:{name:'太极玄清道',sect:'wudang', lv:60, gang:600,  mp:50, mult:6.3, txt:'太极生两仪，剑气如环无端',
            eff:{reflect:.7, heal:.12, mp:.25}, note:'镇派绝技 · 七成反弹，回血回内力'},

  /* ── 峨眉：快，一招连着一招 ── */
  yunv:    {name:'玉女剑法', sect:'emei', lv:3,  cost:50,   mp:4,  mult:1.5, txt:'剑光如雪，缠绵不绝'},
  emeici:  {name:'峨眉刺',   sect:'emei', lv:8,  cost:200,  mp:6,  mult:1.3, txt:'双刺翻飞，快得看不清',
            eff:{double:.4}, note:'四成机会再补一刺'},
  jinding: {name:'金顶绵掌', sect:'emei', lv:15, cost:600,  mp:10, mult:2.2, txt:'绵掌吞吐，暗劲透体'},
  piaoxue: {name:'飘雪穿云掌',sect:'emei', lv:22, cost:1400, mp:14, mult:2.4, txt:'掌影如飞雪漫天',
            eff:{double:.55}, note:'过半机会连出两掌'},
  jiuyin:  {name:'九阴白骨爪',sect:'emei', lv:30, cost:3000, mp:23, mult:3.7, txt:'白骨爪破风而至',
            eff:{drain:.3}, note:'吸走伤害的三成补自己'},
  miejian: {name:'灭剑式',   sect:'emei', lv:40, gang:300,  mp:31, mult:4.3, txt:'灭绝一剑，不留余地',
            eff:{double:.5, drain:.25}, note:'绝学 · 连击加吸血'},
  jieshou:{name:'截手九式', sect:'emei', lv:48, cost:20000, mp:41, mult:5.1, txt:'九式连环，招招截在腕上',
            eff:{double:.6, sure:1}, note:'必中，六成再补一招'},
  foguang:{name:'佛光普照', sect:'emei', lv:60, gang:600,    mp:51, mult:6.4, txt:'掌上金光大盛，照得人睁不开眼',
            eff:{double:.5, drain:.35, heal:.1}, note:'镇派绝技 · 连击、吸血、回血'},

  /* ── 丐帮：刚猛，专破硬壳 ── */
  dagou:   {name:'打狗棒法', sect:'gaibang', lv:3,  cost:50,   mp:4,  mult:1.6, txt:'绊字诀一棒扫出'},
  chanzi:  {name:'缠字诀',   sect:'gaibang', lv:8,  cost:200,  mp:7,  mult:1.4, txt:'棒法一缠，锁住对方兵刃',
            eff:{pierce:.5}, note:'无视对方一半防御'},
  xianglong:{name:'降龙掌',  sect:'gaibang', lv:15, cost:600,  mp:12, mult:2.4, txt:'亢龙有悔，掌力如潮'},
  kanglong:{name:'亢龙有悔', sect:'gaibang', lv:22, cost:1400, mp:17, mult:3.0, txt:'一掌拍出，有去无回',
            eff:{pierce:.7}, note:'几乎无视防御'},
  shibazhang:{name:'降龙十八掌',sect:'gaibang',lv:30,cost:3000,mp:25,mult:3.8, txt:'飞龙在天！掌影蔽空',
            eff:{crit:.25}, note:'暴击率大增'},
  feilong: {name:'神龙摆尾', sect:'gaibang', lv:40, gang:300,  mp:33, mult:4.6, txt:'转身一掌，龙尾扫过',
            eff:{pierce:.6, crit:.2}, note:'绝学 · 破防加暴击'},
  jianlong:{name:'见龙在田', sect:'gaibang', lv:48, cost:20000, mp:43, mult:5.3, txt:'掌风未到，地上尘土已被压平',
            eff:{pierce:.75, stun:.3}, note:'几乎无视防御，还能震住对方'},
  zhanlong:{name:'龙战于野', sect:'gaibang', lv:60, gang:600,  mp:54, mult:6.8, txt:'双掌齐出，其血玄黄',
            eff:{pierce:.7, crit:.3, double:.35}, note:'镇派绝技 · 破防、暴击、还可能连击'},

  /* ── 华山：剑走偏锋，招招见血 ── */
  huashanjian:{name:'华山剑法',sect:'huashan', lv:3,  cost:50,   mp:4,  mult:1.5, txt:'长剑抖出三点寒星'},
  yunvfeng:{name:'玉女峰剑', sect:'huashan', lv:8,  cost:200,  mp:7,  mult:1.9, txt:'一剑刺出，不偏不倚',
            eff:{sure:1}, note:'必中，躲不开'},
  zixia:   {name:'紫霞神功', sect:'huashan', lv:15, cost:600,  mp:11, mult:2.3, txt:'紫气东来，剑气纵横',
            eff:{mp:.15}, note:'出招回一成半内力'},
  yangwu:  {name:'养吾剑',   sect:'huashan', lv:22, cost:1400, mp:15, mult:2.7, txt:'剑气浩然，直指要害',
            eff:{sure:1, crit:.15}, note:'必中，且易中要害'},
  dugu:    {name:'独孤九剑', sect:'huashan', lv:30, cost:3000, mp:24, mult:3.7, txt:'破剑式，无招胜有招',
            eff:{sure:1, crit:.3}, note:'必中，暴击极高'},
  wuzhao:  {name:'无招胜有招',sect:'huashan', lv:40, gang:300,  mp:32, mult:4.5, txt:'长剑随手一挥，已在对方咽喉',
            eff:{sure:1, pierce:.6}, note:'绝学 · 必中且破防'},
  xiyi:{name:'希夷剑法',   sect:'huashan', lv:48, cost:20000, mp:42, mult:5.2, txt:'剑随心走，快得没有影子',
            eff:{sure:1, dodge:.3, turns:2}, note:'必中，且两回合内难被打中'},
  jianqi:{name:'剑气冲霄',  sect:'huashan', lv:60, gang:600,   mp:52, mult:6.6, txt:'一剑刺出，剑气直冲霄汉',
            eff:{sure:1, crit:.35, pierce:.5}, note:'镇派绝技 · 必中、重暴击、破防'},
};

/*#node*/ module.exports = { SKILLS };

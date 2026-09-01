'use strict';
/* 泡点江湖 · 游戏数据表（服务端与客户端共用） */

const SECTS = {
  shaolin:{name:'少林寺', desc:'外家之宗，横练金钟罩，根骨最厚。', bonus:{root:3}, master:'玄慈方丈'},
  wudang: {name:'武当派', desc:'内家之首，以柔克刚，内力绵长。', bonus:{mind:3}, master:'冲虚道长'},
  emei:   {name:'峨眉派', desc:'剑走轻灵，身法飘忽如烟。',       bonus:{agi:3},  master:'灭绝师太'},
  gaibang:{name:'丐帮',   desc:'天下第一大帮，掌法刚猛无俦。',   bonus:{str:3},  master:'洪长老'},
  huashan:{name:'华山派', desc:'气剑双修，样样均衡。', bonus:{str:1,root:1,mind:1,agi:1}, master:'岳掌门'},
};
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

const MAP = {
  cunkou:{name:'杏花村·村口', desc:'村口一株老杏树，落英铺了满地。几个孩童追着黄狗跑过，远处炊烟袅袅。',
    exits:['kezhan','tiejiang','zhulin'],
    paodian:{act:'替村人挑水劈柴', exp:0.7, lv:1, tip:'虽是杂役，却也练力气'} },
  kezhan:{name:'杏花村·悦来客栈', desc:'店里飘着酒气和牛肉香。小二肩上搭着白布，正吆喝着上菜。这是新到江湖的人歇脚闲谈之处。',
    exits:['cunkou'], shop:'inn', treat:true, board:true, quest:true,
    paodian:{act:'在客栈打杂听闲话', exp:1.2, lv:1, tip:'江湖消息，都在酒桌上'} },
  tiejiang:{name:'杏花村·铁匠铺', desc:'炉火烧得通红，老铁匠光着膀子抡锤，火星子溅了一地。',
    exits:['cunkou'], shop:'smith', forge:true },
  zhulin:{name:'村外·竹林小径', desc:'竹影森森，风过处沙沙作响。林中常有剪径的毛贼出没，也常见有人在此盘膝打坐。',
    exits:['cunkou','shanlu'], hunt:['pi','lang','zei'],
    paodian:{act:'竹下盘膝打坐', exp:2.2, lv:5, tip:'心静则气自生'} },
  shanlu:{name:'后山·瀑布', desc:'一道白练从崖顶垂下，水声轰鸣。崖壁上依稀刻着几行剑痕。',
    exits:['zhulin','guandao'], hunt:['xiong','zeitou'],
    paodian:{act:'立于瀑下练功', exp:5, lv:15, tip:'以水磨骨，事半功倍'} },
  guandao:{name:'洛阳·官道', desc:'黄土大道上车马不绝。道旁茶棚里，几个挎刀的汉子正打量着过路人。',
    exits:['shanlu','chengnei','xueshan'], hunt:['mazei','ebar'] },
  xueshan:{name:'塞北·风雪谷', desc:'出关往北，风雪扑面，人马难行。谷中狼嚎彻夜不绝，据说也有中原过不下去的人躲在这里。',
    exits:['guandao','jueding'], hunt:['xuelang','cike'],
    paodian:{act:'踏雪立桩', exp:12, lv:45, tip:'苦寒之地，最磨心志'} },
  jueding:{name:'西域·星宿海', desc:'瀚海尽头，星子低得像要压到头顶。传说魔教总坛就在这一带，寻常人有来无回。',
    exits:['xueshan'], hunt:['hufa','laoguai'],
    paodian:{act:'观星吐纳', exp:18, lv:60, tip:'天地灵气，此处最盛'} },
  chengnei:{name:'洛阳城·长街', desc:'满城牡丹，人声鼎沸。街口贴着武林大会的告示，围了一圈人。',
    exits:['guandao','leitai','shanmen','duchang'], shop:'city', market:true, forge:true, board:true },
  leitai:{name:'洛阳城·比武擂台', desc:'高台三丈，四角挑着红绸。台下人山人海，喝彩声一浪高过一浪。此处可与人较技，也可挑战守擂高手。',
    exits:['chengnei'], arena:true, pk:true },
  duchang:{name:'洛阳城·地下赌坊', desc:'烟雾缭绕，骰盅碰得叮当响。庄家眯着眼，笑得像只老狐狸。',
    exits:['chengnei'], gamble:true },
  shanmen:{name:'山门前', desc:'青石阶蜿蜒而上，云雾深处隐约可见殿宇飞檐。这里是各大门派收徒之地。',
    exits:['chengnei','sect'], joinsect:true },
  sect:{name:'本门·后山', desc:'松风阵阵，同门弟子的吆喝声隐隐传来。师父就在前面的石台上打坐。',
    exits:['shanmen'], learn:true, gang:true, sectOnly:true,
    paodian:{act:'面壁参悟本门心法', exp:11, lv:30, tip:'门派重地，灵气充盈'} },
};

const MOBS = {
  pi:    {name:'瘦弱毛贼', lv:1,  hp:40,   atk:6,   def:1,  exp:20,   gold:12},
  lang:  {name:'饿狼',     lv:4,  hp:90,   atk:14,  def:3,  exp:60,   gold:20},
  zei:   {name:'剪径山贼', lv:8,  hp:180,  atk:26,  def:8,  exp:150,  gold:60},
  xiong: {name:'黑瞎子',   lv:14, hp:420,  atk:48,  def:16, exp:400,  gold:150},
  zeitou:{name:'山贼头目', lv:20, hp:760,  atk:78,  def:28, exp:900,  gold:400},
  mazei: {name:'马贼',     lv:27, hp:1300, atk:118, def:42, exp:1800, gold:900},
  ebar:  {name:'恶霸教头', lv:35, hp:2200, atk:175, def:62, exp:3600, gold:2000},
  xuelang:{name:'雪狼王',  lv:42, hp:3600, atk:240, def:85,  exp:6000,  gold:3200},
  cike:  {name:'白衣刺客', lv:48, hp:5200, atk:320, def:110, exp:9500,  gold:5000},
  hufa:  {name:'魔教护法', lv:56, hp:8000, atk:430, def:145, exp:16000, gold:8500},
  laoguai:{name:'星宿老怪',lv:65, hp:12000,atk:580, def:190, exp:28000, gold:15000},
};

const ARENA = [
  {name:'铁掌帮众', lv:6,  hp:150,  atk:22,  def:6,  exp:120,  gold:80},
  {name:'青城弟子', lv:13, hp:380,  atk:46,  def:15, exp:380,  gold:220},
  {name:'关外刀客', lv:22, hp:900,  atk:92,  def:32, exp:1100, gold:700},
  {name:'魔教长老', lv:32, hp:2000, atk:160, def:58, exp:3200, gold:2400},
  {name:'无名剑客', lv:45, hp:4500, atk:280, def:95, exp:9000, gold:7000},
  {name:'东瀛浪人', lv:55, hp:7500, atk:400, def:135, exp:18000, gold:14000},
  {name:'昆仑剑仙', lv:68, hp:14000,atk:620, def:200, exp:36000, gold:30000},
];

const GANG_FOE = ['青城派弟子','铁掌帮好手','神拳门教头','五毒教弟子','漕帮舵主'];

const EVENTS = [
  {t:'money', p:25, txt:'脚下踢到个硬物，扒开草丛一看，竟是个钱袋。'},
  {t:'exp',   p:20, txt:'恍惚间似有所悟，周身经脉一阵温热。'},
  {t:'hurt',  p:12, txt:'吐纳岔了气，胸口一闷，喉头泛起腥甜。'},
  {t:'herb',  p:18, txt:'石缝里长着一株通体赤红的草药，你小心采下服了。'},
  {t:'book',  p:8,  txt:'树洞中掉出一本残破秘籍，你就着日光读了几页。'},
  {t:'gaoren',p:17, txt:'一位白须老者飘然而至，看你练功，指点了两句便走了。'},
];


/* 虚拟动作：江湖聊天室的灵魂 */
const ACTS = [
  {k:'baoquan', n:'抱拳', solo:'{p}抱拳向四方一礼：「各位江湖朋友，有礼了。」',
                          duo:'{p}向{t}抱拳一礼：「阁下有礼。」'},
  {k:'jingjiu', n:'敬酒', solo:'{p}自斟自饮，一仰脖干了一碗。',
                          duo:'{p}满满斟上一碗，双手捧到{t}面前：「请！」'},
  {k:'daxiao',  n:'大笑', solo:'{p}仰天打了个哈哈，笑声震得梁上灰尘直落。',
                          duo:'{p}指着{t}哈哈大笑，笑得直不起腰来。'},
  {k:'nushi',   n:'怒视', solo:'{p}把碗一顿，环视四周，脸色铁青。',
                          duo:'{p}怒视{t}，手已按在了刀柄上。'},
  {k:'paijian', n:'拍肩', solo:'{p}活动了下筋骨，骨节噼啪作响。',
                          duo:'{p}在{t}肩上重重一拍：「好兄弟！」'},
  {k:'songhua', n:'送花', solo:'{p}从怀里摸出一朵蔫了的野花，看了半天又塞了回去。',
                          duo:'{p}红着脸递给{t}一朵野花。'},
  {k:'tanqi',   n:'叹气', solo:'{p}长叹一声：「江湖路远，人心难测啊。」',
                          duo:'{p}看着{t}摇头叹气。'},
  {k:'baoshou', n:'作揖', solo:'{p}深深一揖到地。',
                          duo:'{p}向{t}深深一揖：「多谢！」'},
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

const TITLES = [
  [1,'初入江湖'],[5,'略识拳脚'],[10,'小有名气'],[16,'一方好手'],[22,'江湖闻名'],
  [30,'名震一方'],[38,'武林高手'],[46,'一代宗师'],[56,'威震武林'],[70,'天下无双'],
];
const titleOf = lv => { let t='初入江湖'; for(const [n,s] of TITLES) if(lv>=n) t=s; return t; };

const plus = n => n>0 ? '+'+n : '';

if (typeof module !== 'undefined') module.exports =
  {SECTS,SKILLS,WEAPONS,ARMORS,MAP,MOBS,ARENA,GANG_FOE,EVENTS,ACTS,PRICE,MATS,DROP,F,titleOf,plus};

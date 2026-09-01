/* 怪物：野怪、守擂高手、械斗对手。加怪改这里。 */

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

/*#node*/ module.exports = { MOBS, ARENA, GANG_FOE };

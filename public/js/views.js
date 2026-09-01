/* 各个整页视图。每个 viewXxx() 返回一段 HTML，由 render() 塞进中栏。 */

function viewBattle(){
  const B = ST.battle, me = ST.me;
  const pct = Math.max(0, Math.min(100, B.foe.hp / B.foe.max * 100));
  let h = '<div class="nm">【交手中　第 '+Math.max(1,B.round)+' 合'+(B.bet?'　赌注 '+B.bet+' 两':'')+'】</div>';
  h += '<div style="margin:2px 0"><b class="r">'+B.foe.name+'</b>'+(B.foe.lv?' <span class="d">'+B.foe.lv+'级</span>':'')+
       '　'+B.foe.hp+' / '+B.foe.max+
       '<div class="bar2"><i style="background:var(--r);width:'+pct+'%"></i></div></div>';
  const st = [];
  if(B.guard) st.push('<span class="g">护体在身</span>');
  if(B.dodge) st.push('<span class="b">身法飘忽</span>');
  if(B.stunned) st.push('<span class="r">气血翻涌，下招使不出</span>');
  if(st.length) h += '<div style="font-size:12px">'+st.join('　')+'</div>';

  if(me.autoFight){
    h += '<div class="acts"><b>自动应敌：</b><span class="d">刀光剑影，看着就行。</span>'+
         '<a onclick="cmd(\'autofight\')">改成自己出招</a></div>';
  }else if(B.myTurn){
    h += '<div class="acts"><b>该你出招'+(B.wait?'（<span class="r" id="cd">'+Math.ceil(B.wait/1000)+'</span> 秒后替你出手）':'')+
         '：</b><br>'+ B.skills.map(s=>
      s.ok ? '<a onclick="cmd(\'strike\',{k:\''+s.k+'\'})" title="'+s.note+'">'+s.name+
             '<span class="d"> 内力'+s.mp+'·威力×'+s.mult+'</span></a>'
           : '<span class="off">'+s.name+'<span class="d"> 内力不足</span></span>').join('')+
      '</div>';
    const withNote = B.skills.filter(s=>s.note);
    if(withNote.length) h += '<div class="d" style="font-size:11px">'+
      withNote.map(s=>s.name+'：'+s.note).join('　｜　')+'</div>';
    h += '<div class="acts"><a onclick="cmd(\'autofight\')">交给自动</a></div>';
  }else{
    h += '<div class="acts"><b>对方出招中……</b><a onclick="cmd(\'autofight\')">交给自动</a></div>';
  }
  return h;
}

function viewRoom(){
  const R = ST.room, me = ST.me;
  if(ST.battle) return viewBattle();
  let h = '';
  if(ST.pending){
    const P = ST.pending;
    h += P.type==='wed'
      ? '<div style="color:var(--p)"><b>♡ '+P.from+' 向你提亲，聘礼 '+PRICE.betrothal+' 两！</b>　'+
        '<a onclick="cmd(\'answer\',{ok:1})">［应了］</a> <a onclick="cmd(\'answer\',{ok:0})">［婉拒］</a></div>'
      : '<div style="color:var(--r)"><b>⚔ '+P.from+' 向你下了战书'+(P.bet?'，赌注 '+P.bet+' 两':'')+'！</b>　'+
        '<a onclick="cmd(\'answer\',{ok:1})">［应战］</a> <a onclick="cmd(\'answer\',{ok:0})">［婉拒］</a></div>';
  }
  h += '<div class="nm">【'+R.name+'】<span class="d"> '+R.desc+'</span></div>';
  let a = '';
  if(R.paodian){
    if(me.idle) a += '<a onclick="cmd(\'idle\')">◆ 收功歇会儿（已得 '+me.idle.acc+' 经验）</a>';
    else if(me.lv >= R.paodian.lv) a += '<a onclick="cmd(\'idle\')" style="border:2px solid var(--g);font-weight:bold">◆ 接着'+
      R.paodian.act+'</a>';
    else a += '<span class="off">'+R.paodian.act+'（需'+R.paodian.lv+'级）</span>';
  }
  if(R.hunt)     a += '<a onclick="cmd(\'hunt\')">寻敌较量</a>';

  if(R.gamble)   a += '<a onclick="cmd(\'gamble\')">押大小</a>';
  if(R.shop)     a += '<a onclick="V.set(\'shop\')">看看货色</a>';
  if(R.treat)    a += '<a onclick="cmd(\'treat\')">请满屋子喝酒</a>';
  if(R.board)    a += '<a onclick="cmd(\'board\')">看墙上告示</a>';
  if(R.quest){
    a += me.quest
      ? (me.quest.got >= me.quest.need
          ? '<a onclick="cmd(\'turnin\')" style="border-color:var(--g)">回禀捕头领赏</a>'
          : '<span class="off">悬赏在身 '+me.quest.got+'/'+me.quest.need+'</span>')
      : '<a onclick="cmd(\'quest\')">接一桩悬赏</a>';
    if(me.quest && me.quest.where && me.quest.got < me.quest.need)
      a += '<span class="d" style="font-size:12px">　（'+me.quest.name+'在'+me.quest.where+'）</span>';
  }
  if(R.market)   a += '<a onclick="V.set(\'market\')">逛长街集市</a>';
  if(me.spouse)  a += '<a onclick="if(confirm(\'摆一场喜宴要 '+PRICE.wedding+' 两，全江湖同贺，确定？\'))cmd(\'wedding\')">大摆喜宴</a>';
  if(R.joinsect) a += '<a onclick="V.set(\'sect\')">拜师入门</a>';
  if(R.learn)    a += '<a onclick="V.set(\'learn\')">求师授艺</a>';
  if(R.gang)     a += '<a onclick="cmd(\'gang\')">下山械斗</a><a onclick="cmd(\'exchange\')">帮贡换赏</a>';
  a += '<a onclick="cmd(\'rest\')">打坐疗伤</a>';
  if(me.herb>0)  a += '<a onclick="cmd(\'herb\')">服金疮药</a>';
  h += '<div class="acts">'+a+'</div>';
  if(R.arena){
    const sh = ST.room.shadows || [];
    h += '<div class="acts"><b>台上留影：</b>';
    h += sh.length
      ? sh.map(s=> s.mine
          ? '<span class="off">你自己（'+s.lv+'级）胜'+s.win+' 负'+s.lose+'</span>'
          : '<a onclick="cmd(\'fightshadow\',{name:\''+s.name+'\'})">'+s.name+'（'+s.lv+'级 '+s.sect+
            '）<span class="d">胜'+s.win+' 负'+s.lose+'</span></a>').join('')
      : '<span class="d">台上还没人留下拳脚。</span>';
    h += '<a onclick="cmd(\'shadow\')" style="border-color:var(--g)">留下我的影子守擂</a>'+
         '<span class="d" style="font-size:12px">　影子会使你会的武功，你不在时也替你应战；打影子不输银子</span></div>';
  }
  if(R.arena) h += '<div class="acts"><b>守擂高手：</b>'+ARENA.map((x,i)=>
    me.lv+12 >= x.lv
      ? '<a onclick="cmd(\'arena\',{i:'+i+'})">'+x.name+'（'+x.lv+'级）</a>'
      : '<span class="off">'+x.name+'（'+x.lv+'级）</span>').join('')+
    '<span class="d" style="font-size:12px">　量力而行，输了要丢一成银子</span></div>';
  h += '<div class="d" id="idletip" style="font-size:12px"></div>';
  return h;
}

const back = () => '<div class="acts"><a onclick="V.set(\'room\')">← 回到'+ST.room.name+'</a></div>';

function viewShop(){
  const R = ST.room, me = ST.me;
  let h = '<div class="nm">【'+R.name+'　'+({inn:'酒菜药材',smith:'铁匠铺',city:'洛阳兵器行'}[R.shop])+'】</div>';
  if(R.shop==='inn'){
    h += '<div class="acts"><b>酒菜：</b>'+
      '<a onclick="cmd(\'buy\',{kind:\'food\'})">女儿红一坛　20两（回满气血内力）</a>'+
      '<a onclick="cmd(\'buy\',{kind:\'herb\'})">金疮药　30两</a></div>';
    return h + back();
  }
  const smith = R.shop==='smith';
  const line = (list,kind,has) => '<div class="acts">'+list.map((it,i)=>{
    if(!it.price || (smith && it.price>1000) || (!smith && it.price<=220)) return '';
    const own = has===it.name;
    return own ? '<span class="off">'+it.name+'（在用）</span>'
      : me.gold>=it.price
        ? '<a onclick="cmd(\'buy\',{kind:\''+kind+'\',i:'+i+'})">'+it.name+' '+
          (kind==='w'?'攻+'+it.atk:'防+'+it.def)+'　'+it.price+'两</a>'
        : '<span class="off">'+it.name+' '+(kind==='w'?'攻+'+it.atk:'防+'+it.def)+'　'+it.price+'两</span>';
  }).join('')+'</div>';
  h += '<div class="acts"><b>兵器：</b></div>'+line(WEAPONS,'w',me.weapon);
  h += '<div class="acts"><b>护体：</b></div>'+line(ARMORS,'a',me.armor);
  if(smith) h += '<div class="d" style="font-size:12px">老铁匠：更好的家伙什，得进洛阳城去寻。</div>';
  if(R.forge) h += forgePanel();
  return h + back();
}

function forgePanel(){
  const me = ST.me;
  const one = (kind) => {
    const isW = kind==='w';
    const it = isW ? WEAPONS[me.wIdx] : ARMORS[me.aIdx];
    const n  = isW ? me.wLv : me.aLv;
    const nm = it.name + (n>0?'+'+n:'');
    if(!it.price) return '<tr><td>'+(isW?'兵器':'护体')+'</td><td class="d" colspan="4">'+it.name+' 不值一打</td></tr>';
    if(n >= F.forgeMax) return '<tr><td>'+(isW?'兵器':'护体')+'</td><td><b class="g">'+nm+
      '</b></td><td class="g" colspan="3">已至顶，炉火纯青</td></tr>';
    const cost = F.forgeCost(it.price, n), rate = F.forgeRate(n), mat = F.forgeMat(n);
    const have = me.mats[mat.k] || 0, matOk = have >= mat.n;
    const now  = isW ? it.atk*F.forge(n)   : it.def*F.forge(n);
    const next = isW ? it.atk*F.forge(n+1) : it.def*F.forge(n+1);
    return '<tr><td>'+(isW?'兵器':'护体')+'</td><td><b>'+nm+'</b> → '+it.name+'+'+(n+1)+'</td>'+
      '<td>'+(isW?'攻':'防')+' '+Math.round(now)+' → <span class="g">'+Math.round(next)+'</span></td>'+
      '<td>'+cost+' 两<br><span class="'+(matOk?'g':'r')+'" style="font-size:11px">'+
      MATS[mat.k].name+'×'+mat.n+'（有 '+have+'）</span></td><td>'+
      (rate>=.5?'<span class="g">':'<span class="r">')+Math.round(rate*100)+'%</span>'+
      (n>=4?'<span class="d"> 失败降级</span>':'')+'</td><td>'+
      (me.gold>=cost && matOk ? '<a onclick="cmd(\'forge\',{kind:\''+kind+'\'})">打造</a>'
        : !matOk ? '<span class="d">缺'+MATS[mat.k].name+'</span>' : '<span class="d">银两不足</span>')+'</td></tr>';
  };
  return '<div class="nm" style="margin-top:6px">【打造　炉子就在里屋，敢不敢试】</div>'+
    '<table><tr><th>部位</th><th>物件</th><th>属性</th><th>费用</th><th>成算</th><th style="width:52px"></th></tr>'+
    one('w') + one('a') + '</table>'+
    '<div class="d" style="font-size:12px">越往上越贵、成算越低；+5 起失败要掉一级。'+
    '精铁玄晶都从怪身上搜，玄晶要 20 级往上的硬点子才有。打造过的东西可以摆到长街上卖。</div>';
}

function viewBag(){
  const me = ST.me, atMarket = ST.room.market;
  let h = '<div class="nm">【行囊　'+me.bagN+' / '+me.bagMax+' 件】</div>';
  h += '<div class="acts"><b>身上：</b>'+
    '<a onclick="cmd(\'unequip\',{kind:\'w\'})">'+me.weapon+' ✕卸下</a>'+
    '<a onclick="cmd(\'unequip\',{kind:\'a\'})">'+me.armor+' ✕卸下</a>'+
    '<span class="d">　精铁 '+(me.mats.jing||0)+'　玄晶 '+(me.mats.xuan||0)+'</span></div>';
  h += '<table><tr><th>物件</th><th>属性</th><th>估价</th><th style="width:150px">　</th></tr>';
  if(!me.bag.length) h += '<tr><td class="d" colspan="4">行囊空空。打怪有一成二的机会掉装备。</td></tr>';
  for(const it of me.bag){
    h += '<tr><td><b>'+it.name+'</b></td><td class="d">'+it.gain+'</td><td class="d">'+it.price+' 两</td><td>'+
      '<a onclick="cmd(\'equip\',{i:'+it.i+'})">换上</a>　'+
      (atMarket ? '<a onclick="doStall('+it.i+',\''+it.name+'\','+it.price+')">摆摊</a>　'
                : '<span class="d">摆摊</span>　')+
      '<a onclick="if(confirm(\'扔掉 '+it.name+'？\'))cmd(\'dropit\',{i:'+it.i+'})">扔了</a></td></tr>';
  }
  h += '</table>';
  if(!atMarket) h += '<div class="d" style="font-size:12px">要摆摊得去洛阳城·长街。</div>';
  return h + back();
}

function viewMarket(){
  const me = ST.me, list = ST.room.stalls || [];
  let h = '<div class="nm">【长街集市　摆摊寄卖，成交抽一成】</div>';
  h += '<table><tr><th>物件</th><th>属性</th><th>摊主</th><th>要价</th><th style="width:52px"></th></tr>';
  if(!list.length) h += '<tr><td class="d" colspan="5">街面上空荡荡的，一个摊子也没有。</td></tr>';
  for(const m of list){
    h += '<tr><td><b>'+m.name+'</b></td><td class="d">'+m.gain+'</td><td>'+m.seller+'</td><td>'+m.price+' 两</td><td>'+
      (m.mine ? '<a onclick="cmd(\'unstall\',{id:'+m.id+'})">收摊</a>'
        : me.gold>=m.price ? '<a onclick="cmd(\'buystall\',{id:'+m.id+'})">买下</a>'
        : '<span class="d">买不起</span>')+'</td></tr>';
  }
  h += '</table>';
  h += '<div class="acts"><b>摆摊：</b>';
  if(!me.bag.length) h += '<span class="d">行囊里没东西可卖（先去<a onclick="V.set(\'bag\')">行囊</a>把身上的卸下来）</span>';
  else h += me.bag.map(it=>'<a onclick="doStall('+it.i+',\''+it.name+'\','+it.price+')">'+it.name+'</a>').join('')+
            '<span class="d" style="font-size:12px">　卖掉的钱扣一成抽头</span>';
  h += '</div>';
  return h + back();
}

function viewSect(){
  const me = ST.me;
  let h = '<div class="nm">【山门前　五大门派收徒】</div>';
  const CN = {str:'力量',root:'根骨',mind:'悟性',agi:'身法'};
  h += '<table><tr><th>门派</th><th>掌门</th><th>路数</th><th>加成</th><th style="width:52px"></th></tr>';
  for(const k in SECTS){ const S = SECTS[k];
    h += '<tr><td><b>'+S.name+'</b></td><td class="d">'+S.master+'</td><td class="d">'+S.desc+'</td><td>'+
      Object.keys(S.bonus).map(b=>CN[b]+'+'+S.bonus[b]).join(' ')+'</td><td>'+
      (me.sectKey ? '<span class="d">—</span>' : me.lv<3 ? '<span class="d">需3级</span>'
        : '<a onclick="cmd(\'join\',{sect:\''+k+'\'})">拜入</a>')+'</td></tr>'; }
  h += '</table><div class="d" style="font-size:12px">入门之后不可改换，想清楚再拜。</div>';
  return h + back();
}

function viewLearn(){
  const me = ST.me;
  let h = '<div class="nm">【本门后山　'+(me.sectKey?SECTS[me.sectKey].master:'')+'】</div><table>'+
          '<tr><th>武学</th><th>门槛</th><th>束脩</th><th>内力</th><th>威力</th><th style="width:52px"></th></tr>';
  for(const k in SKILLS){ const s = SKILLS[k]; if(s.sect !== me.sectKey) continue;
    const has = me.skills.includes(s.name);
    const price = s.gang ? s.gang+' 帮贡' : s.cost+' 两';
    const afford = s.gang ? me.gangPts>=s.gang : me.gold>=s.cost;
    h += '<tr><td>'+(s.gang?'<span class="p">★</span> ':'')+'《'+s.name+'》<span class="d"> '+s.txt+'</span>'+
      (s.note?'<div class="d" style="font-size:11px">'+s.note+'</div>':'')+'</td>'+
      '<td>'+s.lv+'级</td><td>'+price+'</td><td>'+s.mp+'</td><td>×'+s.mult+'</td><td>'+
      (has?'<span class="g">已练成</span>':me.lv<s.lv?'<span class="d">火候未到</span>'
        :!afford?'<span class="d">'+(s.gang?'帮贡不足':'银两不足')+'</span>'
        :'<a onclick="cmd(\'learn\',{k:\''+k+'\'})">参研</a>')+'</td></tr>'; }
  return h + '</table>' + back();
}

function viewHelp(){
  const me = ST.me, left = Math.max(0, me.need - me.exp);
  let t = '<div class="nm">【各处泡点速度　按你现在 '+me.lv+' 级、悟性 '+me.mind+' 算】</div>'+
    '<table><tr><th>修行之处</th><th>动作</th><th>门槛</th><th>每分钟</th><th>每小时</th>'+
    '<th>升到 '+(me.lv+1)+' 级</th></tr>';
  for(const k in MAP){
    const pd = MAP[k].paodian; if(!pd) continue;
    const ok = me.lv >= pd.lv, per = F.idleTick(me, pd) * 30;
    t += '<tr><td>'+(k===ST.room.key?'▶ ':'')+MAP[k].name+'</td><td class="d">'+pd.act+'</td>'+
      '<td>'+pd.lv+' 级</td>'+
      (ok ? '<td class="g">'+per.toFixed(1)+' 点</td><td>'+Math.round(per*60)+' 点</td><td>'+dur(left/per)+'</td>'
          : '<td class="d" colspan="3">火候未到</td>')+'</tr>';
  }
  t += '</table><div class="d" style="font-size:12px">还差 '+left+' 点升级。'+
       '等级超出场地门槛越多，收益衰减越狠（最低剩两成半），所以到点就该挪窝。悟性每点加 2% 收益。</div>';
  return t + '<div class="nm" style="margin-top:6px">【玩法】</div><div class="d" style="line-height:1.9">'+
  '<b>泡点</b>：到了能修行的地方<b>自动开始</b>长经验，页面开着就一直涨，关掉就停；打完架自动接着泡。<br>'+
  '<b>左下角</b>是江湖各处去处和当前人数，哪儿人多去哪儿。<b>右边</b>是此地人物，点名字选中他，就能对他抱拳、敬酒、切磋、塞钱、说悄悄话。<br>'+
  '<b>中间上屏</b>是全服公共频道（聊天、打斗、公告），<b>下屏</b>只显示你自己的收益和私事。<br>'+
  '<b>一个人也有事干</b>：客栈墙上可以贴<b>告示</b>（底下频道选「告示」），离线也留得住；'+
  '找捕头<b>接悬赏</b>，宰够数回来领赏钱和打造材料；给任何人<b>写信</b>，对方不在线照样收得到，还能随信捎银子。<br>'+
  '<b>拜师</b>：3级后去山门，五派任选。<b>切磋</b>：在洛阳擂台可向人下战书，对方应战便当场比试，满屋子人都看得见。</div>' + back();
}

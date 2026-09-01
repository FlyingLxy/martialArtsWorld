/* 渲染：人物状态栏、江湖去处、此地人物、风云榜，以及每秒跳动的泡点进度。
   render() 里的 lastKey 是缓存 —— 新加的状态要记得塞进去，否则界面不会刷新。 */

const V = { set(v){ VIEW=v; lastKey=''; render(); } };

function night(){
  document.body.classList.toggle('night');
  localStorage.setItem('pd_night', document.body.classList.contains('night')?'1':'');
}

function render(){
  if(!ST) return;
  const me = ST.me, R = ST.room;
  $('tag').textContent = me.name+'　'+me.lv+'级　'+me.title+'　'+me.sect;
  $('onl').textContent = '在线 '+ST.world.online+' 人';
  $('rn').textContent = R.people.length+' 人';

  const pct = (a,b) => Math.max(0,Math.min(100,a/b*100))+'%';
  const two = (a,b,c,d) => '<tr><td class="k">'+a+'</td><td class="v">'+b+'</td><td class="k">'+c+'</td><td class="v">'+d+'</td></tr>';
  const wide = (a,b) => '<tr><td class="k">'+a+'</td><td class="v" colspan="3">'+b+'</td></tr>';
  const gauge = (a,c,m,col,note) => '<tr><td class="k">'+a+'</td><td class="v" colspan="3">'+c+' / '+m+
    '<div class="bar2"><i style="background:'+col+';width:'+pct(c,m)+'"></i></div>'+
    (note?'<div class="d" style="font-size:11px;text-align:right">'+note+'</div>':'')+'</td></tr>';
  let h = '<table>';
  h += two('名号','<b>'+me.name+'</b>','等级',me.lv);
  h += wide('称号', me.title+'　<span class="d">'+me.sect+'</span>');
  h += gauge('气血',me.hp,me.maxHp,'var(--r)');
  h += gauge('内力',me.mp,me.maxMp,'var(--b)');
  h += gauge('经验',me.exp,me.need,'var(--g)','还差 '+(me.need-me.exp)+' 点');
  h += two('力量',me.str,'根骨',me.root);
  h += two('悟性',me.mind,'身法',me.agi);
  h += two('攻击',me.atk,'防御',me.def);
  h += two('银两','<b class="g">'+me.gold+'</b>','伤药',me.herb);
  h += wide('兵器', me.weapon+'　<span class="d">'+me.armor+'</span>');
  h += two('精铁', me.mats.jing||0, '玄晶', me.mats.xuan||0);
  h += wide('行囊', '<a onclick="V.set(\'bag\')">'+me.bagN+' / '+me.bagMax+' 件</a>');
  if(me.sectKey) h += two('帮贡',me.gangPts,'斩敌',me.kills);
  h += wide('战绩','胜 '+me.pkWin+'　负 '+me.pkLose+(me.sectKey?'':'　斩敌 '+me.kills));
  if(me.spouse) h += wide('结缡','<span class="p">'+me.spouse+'</span>'+(me.together?' <span class="g">·同处</span>':''));
  if(me.flowers) h += two('收花', me.flowers+' 朵', '', '');
  if(me.quest) h += wide('悬赏', '<span class="p">'+me.quest.name+' '+me.quest.got+' / '+me.quest.need+
    '</span>'+(me.quest.where?'<div class="d" style="font-size:11px">'+me.quest.where+'</div>':''));
  const mb = $('mailBtn');
  if(mb) mb.innerHTML = me.mailN ? '信箱<span style="color:#ffd76e">('+me.mailN+')</span>' : '信箱';
  h += '</table>';
  if(me.pot>0) h += '<div class="acts" style="padding:3px 5px"><b>潜能 '+me.pot+'：</b>'+
    ['str','力量','root','根骨','mind','悟性','agi','身法'].reduce((s,_,i,A)=>
      i%2 ? s : s+'<a onclick="cmd(\'pot\',{k:\''+A[i]+'\'})">+'+A[i+1]+'</a>','')+'</div>';
  h += '<div class="in d" style="font-size:11px">武学：'+me.skills.join('、')+'</div>';
  $('stat').innerHTML = h;

  $('rooms').innerHTML = ST.world.rooms.map(r=>
    '<div class="rm'+(r.here?' here':'')+(r.lock?' lock':'')+(r.n?'':' zero')+'"'+
    (r.here||r.lock?'':' onclick="cmd(\'go\',{to:\''+r.k+'\'})"')+'>'+
    '<b>'+(r.here?'▶ ':'')+r.name+(r.lock?' <span class="d">〔本门弟子〕</span>':'')+'</b><i>'+r.n+'</i></div>').join('');

  $('people').innerHTML = R.people.map(q=>
    '<div class="pr'+(SEL===q.name?' sel':'')+'" onclick="sel(\''+q.name+'\')">'+
    '<span class="'+(q.me?'m':'n')+'">'+q.name+'</span>'+
    '<span class="i"> '+q.lv+'级</span><br><span class="i">'+q.sect+' · </span>'+
    '<span class="i '+(q.act==='修行中'?'g':q.act==='激斗中'?'r':'d')+'">'+q.act+'</span></div>').join('')
    || '<div class="in d">此地空无一人。</div>';

  $('top').innerHTML = ST.world.top.map((q,i)=>
    '<div class="pr" onclick="sel(\''+q.name+'\')"><span class="i">'+(i+1)+'. </span>'+
    '<span class="'+(q.on?'n':'i')+'">'+q.name+'</span><span class="i"> '+q.lv+'级 '+
    (q.on?'<span class="g">·在</span>':'')+'</span><br><span class="i">'+q.title+' · '+q.sect+'</span></div>').join('');

  const key = JSON.stringify([VIEW, R, me.idle&&me.idle.act, ST.pending, me.pot, me.gold, me.lv, me.herb,
    me.spouse, me.weapon, me.armor, me.autoFight, me.bagN, me.mats.jing, me.mats.xuan,
    me.quest && [me.quest.name, me.quest.got], me.mailN, ST.room.shadows,
    ST.battle && [ST.battle.round, ST.battle.foe.hp, ST.battle.myTurn, ST.battle.stunned, ST.battle.skills.map(s=>s.ok)]]);
  if(key !== lastKey){
    lastKey = key;
    $('scene').innerHTML = VIEW==='room' ? viewRoom() : VIEW==='help' ? viewHelp()
      : VIEW==='shop' ? viewShop() : VIEW==='sect' ? viewSect() : VIEW==='learn' ? viewLearn()
      : VIEW==='market' ? viewMarket() : VIEW==='bag' ? viewBag() : viewRoom();
  }
  const tip = $('idletip');
  if(tip && VIEW==='room' && !ST.battle) tip.innerHTML = idleTip();
  const cd = $('cd');
  if(cd && ST.battle && ST.battle.wait) cd.textContent = Math.ceil(ST.battle.wait/1000);
}

function idleTip(){
  const me = ST.me, R = ST.room, pd = MAP[R.key] && MAP[R.key].paodian;
  if(!pd) return me.idle ? '你正'+me.idle.act+'，'+span(me.idle.since) : '';
  if(me.lv < pd.lv) return '<span class="d">此处需 '+pd.lv+' 级才能修行。</span>';
  const per = F.idleTick(me, pd) * 30 * (me.together ? 1.1 : 1);   // 每分钟能得多少
  const left = Math.max(0, me.need - me.exp);
  const tip = '每分钟约 <b class="g">'+per.toFixed(1)+'</b> 点　·　还差 <b>'+left+
              '</b> 点，照这速度约 <b>'+dur(left/per)+'</b>升到 '+(me.lv+1)+' 级';
  const both = me.together ? '　<span class="p">与'+me.spouse+'同处，多一成</span>' : '';
  return me.idle
    ? '你正'+me.idle.act+'，'+span(me.idle.since)+'　已得 '+me.idle.acc+' 点　—— '+tip+both
    : '<b class="r">你歇着呢，经验不涨</b> —— 点上面绿框接着修行。'+tip+both;
}

function dur(min){
  if(!isFinite(min) || min<=0) return '——';
  if(min < 1)  return '不到 1 分钟';
  if(min < 60) return Math.round(min)+' 分钟';
  if(min < 60*24) return (min/60).toFixed(1)+' 小时';
  return (min/1440).toFixed(1)+' 天';
}

function span(since){
  const s = Math.floor((Date.now()-since)/1000);
  return s<60 ? '已泡 '+s+' 秒' : s<3600 ? '已泡 '+Math.floor(s/60)+' 分'
       : '已泡 '+Math.floor(s/3600)+' 时 '+Math.floor(s%3600/60)+' 分';
}

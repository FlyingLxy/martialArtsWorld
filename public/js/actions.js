/* 玩家主动做的事：选中某人、虚拟动作、押注切磋、提亲、塞钱、写信、摆摊。 */

function sel(n){ SEL = (SEL===n?'':n); renderEmo(); lastKey=''; render(); }

function renderEmo(){
  const t = SEL ? '对 <b>'+SEL+'</b>' : '<b>独自</b>';
  $('emo').innerHTML = t + ACTS.map(a=>'<a onclick="cmd(\'act\',{k:\''+a.k+'\',name:\''+SEL+'\'})">'+a.n+'</a>').join('')
    + (SEL ? '　<a onclick="cmd(\'look\',{name:\''+SEL+'\'})">打量</a>'+
             '<a onclick="cmd(\'pk\',{name:\''+SEL+'\'})">切磋</a>'+
             '<a onclick="betPk(\''+SEL+'\')">押注切磋</a>'+
             '<a onclick="cmd(\'flower\',{name:\''+SEL+'\'})">送花 '+PRICE.flower+'两</a>'+
             '<a onclick="doPropose(\''+SEL+'\')">提亲</a>'+
             '<a onclick="give(\''+SEL+'\')">塞钱</a>'+
             '<a onclick="pmTo(\''+SEL+'\')">悄悄话</a>'+
             '<a onclick="doMail(\''+SEL+'\')">写信</a>'
           : '　<span class="d">（点右边的人名，可对他做动作）</span>');
}

function betPk(n){
  const v = prompt('跟 '+n+' 押多少两切磋？双方同押，赢家通吃，看客抽一成彩头。', '500');
  if(v) cmd('pk',{name:n, bet:v});
}

function doPropose(n){
  if(confirm('向 '+n+' 提亲？聘礼 '+PRICE.betrothal+' 两，对方应了才算数。'))
    cmd('propose',{name:n});
}

function give(n){ const v = prompt('给 '+n+' 多少两银子？','100'); if(v) cmd('give',{name:n,n:v}); }

function pmTo(n){ $('say').value = '/'+n+' '; $('say').focus(); }

function doMail(n){
  const who = n || prompt('写给谁？（名号）');
  if(!who) return;
  const text = prompt('给 '+who+' 写点什么？（对方不在线也收得到）');
  if(text === null) return;
  const gold = prompt('顺便捎点银子？不捎就填 0', '0');
  cmd('sendmail', {to:who, text, gold: gold||0});
}

function doStall(slot, name, base){
  const v = prompt('把 '+name+' 摆出去，要价多少两？', String(Math.max(100, base)));
  if(v) cmd('stall',{i:slot, price:v});
}

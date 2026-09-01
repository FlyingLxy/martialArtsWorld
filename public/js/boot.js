/* 起手：读夜间模式、绑回车、决定是直接进还是显示登录框，以及每秒刷新泡点那行。 */

const $ = id => document.getElementById(id);

/* ---------- 登录 ---------- */

/* ---------- 消息分屏 ---------- */

/* ---------- 渲染 ---------- */

/* ---------- 起 ---------- */

if(localStorage.getItem('pd_night')) document.body.classList.add('night');
$('lp').addEventListener('keydown', e=>{ if(e.key==='Enter') login(); });
$('ln').addEventListener('keydown', e=>{ if(e.key==='Enter') $('lp').focus(); });

if(TOK) enter();
else if(localStorage.getItem('pd_n') && localStorage.getItem('pd_p'))
  relogin().then(ok => ok ? enter() : $('ln').focus());
else $('ln').focus();

setInterval(()=>{
  if(!ST) return;
  const t = $('idletip');
  if(VIEW==='room' && t && !ST.battle) t.innerHTML = idleTip();
  const cd = $('cd');
  if(cd){ const n = +cd.textContent; if(n > 0) cd.textContent = n - 1; }
}, 1000);

/* 连接与收发：登录、SSE 长连接、发指令、把消息分到上下两屏。
   这一层不碰界面，只负责把数据拿回来。 */

let TOK = localStorage.getItem('pd_tok') || '';

let ST = null, VIEW = 'room', ES = null, lastKey = '', SEL = '';

const SEEN = new Set();

const esc = s => String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));

async function post(url, o){
  return fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
                    body:JSON.stringify(o)}).then(r=>r.json()).catch(()=>({err:'连不上服务器'}));
}

async function login(){
  const name = $('ln').value.trim(), pass = $('lp').value;
  if(!name || !pass){ $('err').textContent = '名号和暗号都得填。'; return; }
  let r = await post('/api/login', {name, pass});
  if(r.isNew){
    $('err').textContent = '';
    if(!confirm('江湖上还没有「'+name+'」这个名号。\n\n要新建一个角色吗？\n（如果你是老玩家，八成是名字打错了一个字——取消再核对一下）'))
      { $('err').textContent = '那就再核对一下名号。'; return; }
    r = await post('/api/login', {name, pass, create:1});
  }
  if(r.err){ $('err').textContent = r.err; return; }
  TOK = r.token;
  localStorage.setItem('pd_tok',TOK); localStorage.setItem('pd_n',name); localStorage.setItem('pd_p',pass);
  enter();
}

async function relogin(){
  const name = localStorage.getItem('pd_n'), pass = localStorage.getItem('pd_p');
  if(!name || !pass) return false;
  const r = await post('/api/login', {name, pass, create:1});
  if(r.err || !r.token) return false;
  TOK = r.token; localStorage.setItem('pd_tok', TOK); return true;
}

function logout(){
  localStorage.removeItem('pd_tok'); localStorage.removeItem('pd_p');
  if(ES) ES.close(); location.reload();
}

function enter(){
  $('login').style.display='none'; $('app').style.display='flex';
  $('say').addEventListener('keydown', e=>{ if(e.key==='Enter') send(); });
  renderEmo();
  connect();
}

function connect(){
  if(ES) ES.close();
  ES = new EventSource('/api/events?token='+encodeURIComponent(TOK));
  ES.onmessage = e => handle(JSON.parse(e.data));
  ES.onerror = async () => {
    if(ES.readyState === EventSource.CLOSED){
      out('pub', '<span class="d">与江湖失去联系，正在重连……</span>');
      if(await relogin()) setTimeout(connect, 1200); else setTimeout(()=>location.reload(), 2500);
    }
  };
}

function cmd(c, args){ post('/api/cmd', {token:TOK, cmd:c, args:args||{}}); }

function send(){
  const v = $('say').value.trim(); if(!v) return;
  $('say').value='';
  const ch = $('ch').value;
  if(ch === 'board') cmd('post', {text:v});
  else cmd('say', {ch, text:v});
}

function out(where, html, cls){
  const box = $(where);
  const stick = box.scrollTop + box.clientHeight > box.scrollHeight - 40;
  const d = document.createElement('div');
  if(cls) d.className = cls;
  d.innerHTML = html;
  box.appendChild(d);
  while(box.children.length > 300) box.removeChild(box.firstChild);
  if(stick) box.scrollTop = box.scrollHeight;
}

function handle(m){
  if(m.t==='ping') return;
  if(m.t==='state'){ ST = m; render(); return; }
  if(m.t==='vitals'){                       // 高频小包：只更新那几个数
    if(!ST) return;
    const me = ST.me;
    me.hp=m.hp; me.mp=m.mp; me.exp=m.exp; me.need=m.need; me.lv=m.lv;
    me.gold=m.gold; me.herb=m.herb; me.pot=m.pot;
    if(me.idle && m.acc !== null){ me.idle.acc = m.acc; me.idle.since = m.since; }
    if(ST.battle){
      if(m.foeHp !== null) ST.battle.foe.hp = m.foeHp;
      if(m.round !== null) ST.battle.round = m.round;
      ST.battle.wait = m.wait; ST.battle.myTurn = m.myTurn;
    }
    render();
    return;
  }
  const where = m.scope==='me' ? 'me' : 'pub';
  if(m.t==='log') return out(where, m.html, m.cls);
  if(m.t==='chat'){
    if(m.id){ if(SEEN.has(m.id)) return; SEEN.add(m.id); }
    if(m.ch==='sys') return out('pub', '<span class="sys">〔江湖〕'+m.text+'</span>');
    const tag = {world:'', room:'〔本地〕', sect:'〔门派〕', pm:'〔悄悄话〕'}[m.ch] || '';
    const who = m.ch==='pm'
      ? (m.to && ST && m.from!==ST.me.name ? m.from+' 对你说' : '你对 '+m.to+' 说')
      : m.from + (m.lv?'('+m.lv+')':'');
    out(where, '<span class="d">'+tag+'</span><span class="who">'+esc(who)+'</span><span class="d">：</span>'+m.text);
  }
}

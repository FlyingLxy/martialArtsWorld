#!/usr/bin/env node
/* 检查 server/ 各模块的跨模块引用：用了别人的东西却没 require，
 * 这种错只在跑到那行代码时才炸，测试可能覆盖不到，所以静态查一遍。
 * 顺带检测循环依赖——拆模块最容易翻车的地方。 */
const fs = require('node:fs');
const path = require('node:path');
const dir = __dirname;

const mods = fs.readdirSync(dir).filter(f => f.endsWith('.js') && !['check.js','config.js'].includes(f))
                .map(f => f.slice(0, -3));

const owner = {}, defined = {}, required = {}, src = {};
for(const m of mods){
  const s = fs.readFileSync(path.join(dir, m + '.js'), 'utf8');
  src[m] = s;
  const exp = (s.match(/module\.exports = \{([^}]+)\}/) || [, ''])[1]
                .split(',').map(x => x.trim()).filter(Boolean);
  exp.forEach(e => owner[e] = m);
  defined[m] = new Set([...s.matchAll(/^(?:async )?function (\w+)|^(?:const|let|var) (\w+)\s*=/gm)]
                .map(x => x[1] || x[2]));
  required[m] = new Set();
  for(const r of s.matchAll(/const \{([^}]+)\} = require\('\.\/(\w+)\.js'\)/g))
    r[1].split(',').forEach(n => required[m].add(n.trim()));
}

let miss = 0;
for(const m of mods){
  const body = src[m].split('\n').filter(l => !l.startsWith('const ')).join('\n');
  for(const sym in owner){
    if(owner[sym] === m || defined[m].has(sym) || required[m].has(sym)) continue;
    if(new RegExp('(?<![\\w.$])' + sym + '\\s*\\(').test(body)){
      console.error(`✗ ${m}.js 用了 ${sym}()，但没从 ${owner[sym]}.js 引入`);
      miss++;
    }
  }
}

// 循环依赖
const deps = {};
for(const m of mods) deps[m] = [...src[m].matchAll(/require\('\.\/(\w+)\.js'\)/g)].map(x => x[1]);
let cyc = 0; const stack = [], done = new Set();
(function walk(n){
  if(stack.includes(n)){ console.error('✗ 循环依赖：' + stack.slice(stack.indexOf(n)).join(' → ') + ' → ' + n); cyc++; return; }
  if(done.has(n)) return;
  done.add(n); stack.push(n);
  for(const d of deps[n] || []) walk(d);
  stack.pop();
})(mods[0]);
for(const m of mods) if(!done.has(m)) (function w(n){ done.add(n); (deps[n]||[]).forEach(d=>done.has(d)||w(d)); })(m);

if(miss || cyc){ console.error(`\n${miss} 处缺引入，${cyc} 处循环依赖。`); process.exit(1); }
console.log(`server 模块检查通过（${mods.length} 个模块，依赖单向无环）`);

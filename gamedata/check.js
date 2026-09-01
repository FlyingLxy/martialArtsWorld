#!/usr/bin/env node
/* 检查 gamedata/ 各文件的跨文件引用有没有漏声明。
 *
 * 为什么需要这个：浏览器那边是把所有文件按序拼起来的，同一个作用域，
 * 谁引用谁都不会报错；但 Node 端是各自 require 的，漏了声明就在运行时炸。
 * 这种 bug 只在服务端出现，前端测不出来，所以单独检一遍。
 */
const fs = require('node:fs');
const path = require('node:path');
const D = require('./index.js');
const dir = __dirname;

const owner = {};                                   // 符号 → 定义它的文件
for(const f of D.ORDER){
  const src = fs.readFileSync(path.join(dir, f + '.js'), 'utf8');
  for(const m of src.matchAll(/^const ([A-Za-z_$][\w$]*)\s*=/gm)) owner[m[1]] = f;
}

let bad = 0;
for(const f of D.ORDER){
  const src = fs.readFileSync(path.join(dir, f + '.js'), 'utf8');
  const body = src.split('\n').filter(l => !l.trimStart().startsWith('/*#node*/')).join('\n');
  const declared = new Set([...src.matchAll(/^const ([A-Za-z_$][\w$]*)\s*=/gm)].map(m => m[1]));
  const required = new Set([...src.matchAll(/require\("\.\/(\w+)\.js"\)/g)].map(m => m[1]));
  for(const sym in owner){
    if(declared.has(sym) || owner[sym] === f) continue;
    if(new RegExp('\\b' + sym + '\\b').test(body) && !required.has(owner[sym])){
      console.error(`✗ ${f}.js 用了 ${sym}，但没有 /*#node*/ require("./${owner[sym]}.js")`);
      bad++;
    }
  }
}
if(bad){ console.error(`\n${bad} 处漏声明。浏览器端不会报错，服务端会在运行时炸。`); process.exit(1); }
console.log('gamedata 跨文件引用检查通过（' + D.ORDER.length + ' 个文件）');

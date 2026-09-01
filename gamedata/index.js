/* 数据表总入口。服务端 require("./gamedata")；
   浏览器那边由 /data.js 端点把下面这些文件按序拼好一次性送过去。 */

const ORDER = ['sects', 'skills', 'items', 'map', 'mobs', 'flavor', 'formulas'];

const all = {};
for(const f of ORDER) Object.assign(all, require('./' + f + '.js'));

module.exports = all;
module.exports.ORDER = ORDER;

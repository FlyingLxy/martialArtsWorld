/* 全局配置。改端口、改存档位置，或者部署时用环境变量覆盖，都在这儿。 */
'use strict';
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

module.exports = {
  ROOT,
  PORT: process.env.PORT || 8080,
  DATA: process.env.DATA_FILE || path.join(ROOT, 'data.json'),   // 文件模式的存档；配了 DB_HOST 就走 MySQL
  PUB : path.join(ROOT, 'public'),
};

'use strict';
/* 泡点江湖 · 入口
 *
 * 真正的逻辑在 server/ 下按职责分开了，依赖是单向的，不存在互相 require：
 *
 *   config ─ 端口、存档位置
 *   core   ─ 世界状态、玩家对象、存档、SSE 推送、聊天      （谁都依赖它，它不依赖谁）
 *   state  ─ 打包发给前端的状态，sync 在这儿
 *   growth ─ 经验升级、泡点收益、奇遇
 *   idle   ─ 泡点
 *   economy─ 打造、穿脱、集市、请客送花成亲
 *   social ─ 告示、书信、悬赏、擂台留影
 *   combat ─ 战斗与切磋
 *   commands ─ 指令表，前后端的接口清单
 *   http   ─ 三个接口、限流、静态文件、开服
 *
 * 加新玩法：先看它属于哪一摊，再决定动哪个文件；跨摊调用请遵守上面的依赖方向。
 */
require('./server/http.js');

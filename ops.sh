#!/bin/bash
# 日常运维就用这个，不用记 docker 命令
#   ./ops.sh            看总体状况
#   ./ops.sh log        看游戏日志（Ctrl+C 退出）
#   ./ops.sh log db     看数据库日志
#   ./ops.sh restart    重启游戏（不动数据库）
#   ./ops.sh update     拉最新代码并重启
#   ./ops.sh backup     立刻备份一次
#   ./ops.sh stop       全停
#   ./ops.sh start      全起
cd "$(dirname "$0")"
DC="docker compose"

case "${1:-status}" in
  status|"")
    echo "── 容器 ──────────────────────────────"
    $DC ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || $DC ps
    echo
    echo "── 机器 ──────────────────────────────"
    echo "  内存： $(free -h | awk '/Mem:/{print $3" / "$2"  可用 "$7}')"
    echo "  磁盘： $(df -h / | awk 'NR==2{print $3" / "$2"  ("$5")"}')"
    echo "  负载： $(uptime | sed 's/.*load average: //')"
    echo
    echo "── 游戏 ──────────────────────────────"
    ON=$(curl -s -m 3 http://127.0.0.1:8080/ -o /dev/null -w "%{http_code}" 2>/dev/null)
    [ "$ON" = "200" ] && echo "  网页： 正常（200）" || echo "  网页： 异常（$ON）"
    if $DC exec -T db mysql -upaodian -p"$(grep MYSQL_PASSWORD .env | cut -d= -f2)" paodian \
         -e "SELECT COUNT(*) FROM players" 2>/dev/null | tail -1 | grep -qE '^[0-9]+$'; then
      N=$($DC exec -T db mysql -upaodian -p"$(grep MYSQL_PASSWORD .env | cut -d= -f2)" paodian \
          -sN -e "SELECT COUNT(*) FROM players" 2>/dev/null)
      TOP=$($DC exec -T db mysql -upaodian -p"$(grep MYSQL_PASSWORD .env | cut -d= -f2)" paodian \
          -sN -e "SELECT CONCAT(name,' ',lv,'级') FROM players ORDER BY lv DESC LIMIT 3" 2>/dev/null | tr '\n' ' ')
      echo "  角色： $N 个    榜首： $TOP"
    fi
    echo
    echo "── 最近的备份 ────────────────────────"
    ls -1t backups/*.gz 2>/dev/null | head -3 | while read -r f; do
      echo "  $(basename "$f")  $(ls -lh "$f" | awk '{print $5}')"
    done || echo "  还没有备份"
    ;;
  log)      $DC logs -f --tail=100 "${2:-game}" ;;
  restart)  $DC restart game && echo "游戏重启了（数据库没动）" ;;
  update)
    BEFORE=$(git rev-parse --short HEAD)
    git pull -q || { echo "拉代码失败"; exit 1; }
    AFTER=$(git rev-parse --short HEAD)
    if [ "$BEFORE" = "$AFTER" ]; then echo "已经是最新的（$AFTER）"; exit 0; fi
    # 依赖变了才需要重新构建镜像，否则源码是挂载进去的，重启就行
    if git diff --name-only $BEFORE $AFTER | grep -qE '^(package|Dockerfile)'; then
      echo "依赖或镜像有变动，重新构建…"; $DC build game && $DC up -d game
    else
      $DC restart game
    fi
    echo "$BEFORE → $AFTER  更新完毕"
    git log --oneline $BEFORE..$AFTER | sed 's/^/  /'
    ;;
  backup)   ./backup.sh --verify ;;
  stop)     $DC down && echo "全停了（数据还在，volume 没删）" ;;
  start)    $DC up -d && echo "起来了" ;;
  *)        sed -n '2,12p' "$0" ;;
esac

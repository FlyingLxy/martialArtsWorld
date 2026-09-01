#!/bin/bash
# 存档备份。文件模式和 MySQL 模式都认，自动判断。
#
#   ./backup.sh              备份一次
#   ./backup.sh --verify     备份并验证这份备份能不能读回来
#
# 环境变量（可写进同目录的 .env）：
#   DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME  配了就 dump MySQL，没配就备份 data.json
#   BACKUP_DIR   备份放哪，默认 ./backups
#   KEEP         保留最近几份，默认 30
#   TOS_BUCKET   配了就顺手传一份到火山对象存储（需要先 ve configure）

set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP="${KEEP:-30}"
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

if [ -n "${DB_HOST:-}" ]; then
  OUT="$BACKUP_DIR/paodian-$STAMP.sql.gz"
  echo "→ 从 MySQL（${DB_HOST}:${DB_PORT:-3306}/${DB_NAME:-paodian}）导出…"
  # single-transaction：不锁表，玩家可以照常玩
  # no-tablespaces：普通账号（包括云上 RDS 给的）没有 PROCESS 权限，不加这个会报错
  # 容器里跑的话：MYSQLDUMP="docker compose exec -T db mysqldump"
  ${MYSQLDUMP:-mysqldump} -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "${DB_USER:-paodian}" \
            -p"${DB_PASS:-}" --single-transaction --no-tablespaces --routines --triggers \
            "${DB_NAME:-paodian}" | gzip > "$OUT"
else
  OUT="$BACKUP_DIR/paodian-$STAMP.json.gz"
  SRC="${DATA_FILE:-./data.json}"
  echo "→ 备份文件存档（${SRC}）…"
  [ -f "$SRC" ] || { echo "找不到 $SRC"; exit 1; }
  gzip -c "$SRC" > "$OUT"
fi

SIZE=$(ls -lh "$OUT" | awk '{print $5}')
echo "  已存到 ${OUT}（${SIZE}）"

# 验证：没验证过的备份等于没有备份
if [ "${1:-}" = "--verify" ]; then
  echo "→ 验证这份备份读得回来…"
  if [[ "$OUT" == *.sql.gz ]]; then
    ROWS=$(gunzip -c "$OUT" | grep -c "INSERT INTO" || true)
    gunzip -t "$OUT" && echo "  压缩包完好，含 ${ROWS} 条 INSERT"
  else
    gunzip -c "$OUT" | node -e "
      let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
        const j=JSON.parse(s); const n=Object.keys(j.players||{}).length;
        if(!n) { console.error('  备份里一个玩家都没有！'); process.exit(1); }
        console.log('  JSON 解析通过，含 '+n+' 名玩家');
      });"
  fi
fi

# 只留最近 KEEP 份
ls -1t "$BACKUP_DIR"/paodian-*.gz 2>/dev/null | tail -n +$((KEEP+1)) | while read -r f; do
  echo "  清掉旧的 $(basename "$f")"; rm -f "$f"
done

# 异地：传一份到对象存储，机器整个没了也还有
if [ -n "${TOS_BUCKET:-}" ]; then
  echo "→ 上传到 tos://$TOS_BUCKET/paodian/ …"
  ve tos put --bucket "$TOS_BUCKET" --key "paodian/$(basename "$OUT")" --file "$OUT" \
    && echo "  传好了" || echo "  ！上传失败（本地这份还在）"
fi
echo "完成。"
echo
if [[ "$OUT" == *.sql.gz ]]; then
  echo "要恢复的话："
  echo "  gunzip -c $OUT | mysql -h \$DB_HOST -u \$DB_USER -p \$DB_NAME"
else
  echo "要恢复的话：先停服，再"
  echo "  gunzip -c $OUT > data.json"
fi

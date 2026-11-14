#!/usr/bin/env bash
# Ежедневный бэкап: дамп Postgres + архив загруженных фото. Хранит 14 дней.
# Cron (раз в сутки в 03:30):  30 3 * * * /opt/stylist-ai/scripts/backup.sh >> /var/log/stylist-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml"
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups

$COMPOSE exec -T db pg_dump -U stylist stylist | gzip > "backups/db-$STAMP.sql.gz"
$COMPOSE exec -T api tar czf - -C /data uploads > "backups/uploads-$STAMP.tgz"

find backups -type f -mtime +14 -delete
echo "[$STAMP] backup ok"
# Восстановление БД:  gunzip -c backups/db-XXXX.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U stylist stylist

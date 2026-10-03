#!/bin/sh
# Первый запуск: если задан SITE_REPO — клонируем репозиторий сайта в /site (его правит админка, а PUBLISH_GIT=1 отправляет изменения на GitHub).
# Без SITE_REPO сайт берётся из образа (/app) — тогда заявки и админка работают, а правки содержимого живут только до пересборки образа.
set -e
SITE_ROOT="${SITE_ROOT:-/site}"
if [ -n "$SITE_REPO" ]; then
  if [ ! -d "$SITE_ROOT/.git" ]; then
    echo "Клонирую сайт в $SITE_ROOT …"
    git clone --branch "${SITE_BRANCH:-main}" "$SITE_REPO" "$SITE_ROOT"
  fi
  git config --global --add safe.directory "$SITE_ROOT" || true
else
  export SITE_ROOT=/app
fi
exec node /app/server/index.js

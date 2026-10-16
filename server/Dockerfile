# Сервер заявок и админки «Астрея». Сборка из корня репозитория:
#   docker build -f server/Dockerfile -t astreya-server .
# Запуск и переменные окружения — в server/README.md
FROM node:22-alpine
RUN apk add --no-cache git openssh-client
WORKDIR /app
COPY . .
# необязательный ИИ-режим помощника: пакет @anthropic-ai/sdk (если установка не удалась, сервер работает без ИИ-режима)
RUN npm install --omit=dev --no-audit --no-fund || echo "npm install пропущен — ИИ-режим помощника выключен"
RUN chmod +x server/docker-entrypoint.sh && mkdir -p /data /site && chown -R node:node /app /data /site
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data SITE_ROOT=/site TRUST_PROXY=1
VOLUME ["/data", "/site"]
EXPOSE 8080
USER node
ENTRYPOINT ["server/docker-entrypoint.sh"]

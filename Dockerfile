FROM node:22-alpine

WORKDIR /app

# 先只拷依赖清单，利用镜像层缓存：改代码不用重装依赖
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY server.js store.js ./
COPY gamedata ./gamedata
COPY public ./public

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# 容器里存档默认落在 /data，compose 里会把它挂到宿主机
ENV DATA_FILE=/data/data.json
VOLUME ["/data"]

# 让 SIGTERM 直接送到 node，这样关容器时来得及存档
STOPSIGNAL SIGTERM
CMD ["node", "server.js"]

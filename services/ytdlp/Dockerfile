# Use Python image so we get yt-dlp easily, then add Node 20
FROM python:3.12-slim

ENV NODE_VERSION=20.17.0
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates xz-utils ffmpeg \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
       | tar -xJ -C /usr/local --strip-components=1 \
  && pip install --no-cache-dir --upgrade yt-dlp \
  && ln -sf "$(which yt-dlp)" /usr/local/bin/yt-dlp \
  && apt-get purge -y curl xz-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --omit=dev=false
COPY src ./src
RUN npx tsc -p tsconfig.json

ENV NODE_ENV=production
ENV YTDLP_BIN=/usr/local/bin/yt-dlp
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server.js"]

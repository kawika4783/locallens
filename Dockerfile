FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN YOUTUBE_DL_SKIP_PYTHON_CHECK=1 YOUTUBE_DL_SKIP_DOWNLOAD=1 npm ci

COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build


FROM debian:bookworm-slim AS pot-plugin

ARG BGUTIL_PLUGIN_VERSION=1.3.1
ARG BGUTIL_PLUGIN_SHA256=b8ceec7f76143da172aaf5ebeec0c2d218e5680c063b931586bca48567069b38

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl --fail --location --silent --show-error \
    --output /bgutil-ytdlp-pot-provider.zip \
    "https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/${BGUTIL_PLUGIN_VERSION}/bgutil-ytdlp-pot-provider.zip" \
  && echo "${BGUTIL_PLUGIN_SHA256}  /bgutil-ytdlp-pot-provider.zip" | sha256sum --check --strict \
  && rm -rf /var/lib/apt/lists/*


FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8787 \
    HOME=/tmp

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=pot-plugin /bgutil-ytdlp-pot-provider.zip \
  ./node_modules/youtube-dl-exec/bin/yt-dlp-plugins/bgutil-ytdlp-pot-provider.zip

COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server

RUN mkdir -p /app/downloads && chown node:node /app/downloads

USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/api/health').then(r=>{if(!r.ok)throw new Error(String(r.status))}).catch(()=>process.exit(1))"]

CMD ["node", "server/index.js"]

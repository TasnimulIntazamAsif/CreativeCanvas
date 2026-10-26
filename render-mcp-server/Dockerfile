# Remote (Streamable HTTP) build of the render MCP server.
# ffmpeg ships via ffmpeg-static (downloaded during npm install), so no apt ffmpeg.
FROM node:22-slim

WORKDIR /app

# ca-certificates lets the server download http(s) input URLs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install deps first (downloads the Linux ffmpeg/ffprobe binaries).
COPY package.json ./
RUN npm install --no-audit --no-fund

# Build the TypeScript.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV TRANSPORT=http
ENV PORT=3000
ENV NODE_ENV=production
ENV RENDER_OUTPUT_DIR=/app/renders

EXPOSE 3000
CMD ["node", "dist/index.js"]

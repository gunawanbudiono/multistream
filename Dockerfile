FROM mwader/static-ffmpeg:7.1 AS ffmpeg-source

# Gunakan base image Node.js versi 20 dengan Debian Bookworm
FROM node:20-bookworm

# Set Timezone ke Asia/Jakarta
ENV TZ=Asia/Jakarta
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Copy FFmpeg 7.1 and FFprobe 7.1 static binaries with Enhanced RTMP support
COPY --from=ffmpeg-source /ffmpeg /usr/local/bin/
COPY --from=ffmpeg-source /ffprobe /usr/local/bin/
COPY --from=denoland/deno:bin /deno /usr/local/bin/deno

# Install dependency sistem yang dibutuhkan
RUN apt-get update && apt-get install -y \
    tzdata \
    python3 \
    python3-pip \
    curl \
    make \
    g++ \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && pip3 install --break-system-packages bgutil-ytdlp-pot-provider \
    && rm -rf /var/lib/apt/lists/*

# Set working directory di dalam container
WORKDIR /app

# Copy package.json dan package-lock.json
COPY package*.json ./

# Install dependency production with BuildKit cache mount for instant builds
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev \
    && npm rebuild sqlite3 --build-from-source

# Copy seluruh source code
COPY . .

# Buat folder yang dibutuhkan (jika belum ada)
RUN mkdir -p db logs public/uploads/videos public/uploads/thumbnails

# Expose port (default 7575, bisa diubah via .env)
EXPOSE 7575

# Jalankan aplikasi
CMD ["npm", "start"]
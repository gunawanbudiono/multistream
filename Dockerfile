# Gunakan base image Node.js versi 20 dengan Debian Bookworm
FROM node:20-bookworm

# Set Timezone ke Asia/Jakarta
ENV TZ=Asia/Jakarta
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Install dependency sistem yang dibutuhkan (ffmpeg untuk video, build tools untuk native module seperti sqlite3, tzdata)
RUN apt-get update && apt-get install -y \
    tzdata \
    ffmpeg \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory di dalam container
WORKDIR /app

# Copy package.json dan package-lock.json
COPY package*.json ./

# Install dependency production, lalu rebuild sqlite3 dari source agar kompatibel
RUN npm install --omit=dev \
    && npm rebuild sqlite3 --build-from-source

# Copy seluruh source code
COPY . .

# Buat folder yang dibutuhkan (jika belum ada)
RUN mkdir -p db logs public/uploads/videos public/uploads/thumbnails

# Expose port (default 7575, bisa diubah via .env)
EXPOSE 7575

# Jalankan aplikasi
CMD ["npm", "start"]
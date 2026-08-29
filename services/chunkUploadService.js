const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const CHUNK_SIZE = 25 * 1024 * 1024;
const TEMP_DIR = path.join(__dirname, '../public/uploads/temp');
const INFO_DIR = path.join(__dirname, '../public/uploads/temp/info');
const VIDEOS_DIR = path.join(__dirname, '../public/uploads/videos');

fs.ensureDirSync(TEMP_DIR);
fs.ensureDirSync(INFO_DIR);
fs.ensureDirSync(VIDEOS_DIR);

function generateFileHash(filename, fileSize, userId) {
  return crypto.createHash('md5').update(`${filename}-${fileSize}-${userId}`).digest('hex');
}

function getInfoPath(uploadId) {
  return path.join(INFO_DIR, `${uploadId}.json`);
}

function getChunkPath(uploadId, chunkIndex) {
  return path.join(TEMP_DIR, `${uploadId}_chunk_${chunkIndex}`);
}

async function findExistingUpload(filename, fileSize, userId) {
  const fileHash = generateFileHash(filename, fileSize, userId);
  const infoPath = getInfoPath(fileHash);
  if (await fs.pathExists(infoPath)) {
    const info = await fs.readJson(infoPath);
    if (info.status === 'uploading' || info.status === 'paused') {
      return info;
    }
  }
  return null;
}

async function initUpload(filename, fileSize, totalChunks, userId, options = {}) {
  const existingUpload = await findExistingUpload(filename, fileSize, userId);
  if (existingUpload) {
    if (existingUpload.totalChunks !== totalChunks) {
      await cleanupUpload(existingUpload.uploadId);
    } else {
      existingUpload.folderId = options.folderId || existingUpload.folderId || null;
      existingUpload.status = 'uploading';
      existingUpload.lastActivity = Date.now();
      await fs.writeFile(getInfoPath(existingUpload.uploadId), JSON.stringify(existingUpload));
      return existingUpload;
    }
  }
  const uploadId = generateFileHash(filename, fileSize, userId);
  const info = {
    uploadId,
    filename,
    fileSize,
    totalChunks,
    uploadedChunks: [],
    userId,
    folderId: options.folderId || null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    status: 'uploading'
  };
  await fs.writeFile(getInfoPath(uploadId), JSON.stringify(info));
  return info;
}

async function getUploadedChunksList(uploadId, totalChunks) {
  const list = [];
  for (let i = 0; i < totalChunks; i++) {
    if (await fs.pathExists(getChunkPath(uploadId, i))) {
      list.push(i);
    }
  }
  return list;
}

async function getUploadInfo(uploadId) {
  const infoPath = getInfoPath(uploadId);
  if (await fs.pathExists(infoPath)) {
    try {
      const content = await fs.readFile(infoPath, 'utf8');
      if (!content || !content.trim()) return null;
      const info = JSON.parse(content);
      info.uploadedChunks = await getUploadedChunksList(uploadId, info.totalChunks);
      return info;
    } catch (e) {
      return null;
    }
  }
  return null;
}

async function saveChunk(uploadId, chunkIndex, chunkData) {
  const chunkPath = getChunkPath(uploadId, chunkIndex);
  await fs.writeFile(chunkPath, chunkData);
  
  try {
    recordChunkSpeed(uploadId, chunkData.length);
    const infoPath = getInfoPath(uploadId);
    if (await fs.pathExists(infoPath)) {
      const now = new Date();
      await fs.utimes(infoPath, now, now);
      // Keep lastActivity updated so long uploads (> 2h) are never killed
      const info = await fs.readJson(infoPath);
      info.lastActivity = Date.now();
      await fs.writeJson(infoPath, info);
    }
  } catch (e) {}

  return {
    chunkIndex,
    success: true
  };
}

async function pauseUpload(uploadId) {
  const infoPath = getInfoPath(uploadId);
  if (await fs.pathExists(infoPath)) {
    try {
      const info = await fs.readJson(infoPath);
      info.status = 'paused';
      info.lastActivity = Date.now();
      await fs.writeJson(infoPath, info);
    } catch (e) {}
  }
}

async function mergeChunks(uploadId) {
  const info = await getUploadInfo(uploadId);
  if (!info) {
    throw new Error('Upload session not found');
  }

  const missingChunks = [];
  for (let i = 0; i < info.totalChunks; i++) {
    if (!await fs.pathExists(getChunkPath(uploadId, i))) {
      missingChunks.push(i);
    }
  }

  if (missingChunks.length > 0) {
    throw new Error(`Missing chunk(s): ${missingChunks.slice(0, 5).join(', ')} (Total missing: ${missingChunks.length})`);
  }

  const ext = path.extname(info.filename);
  const basename = path.basename(info.filename, ext)
    .replace(/[^a-z0-9]/gi, '-')
    .toLowerCase();
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  const finalFilename = `${basename}-${timestamp}-${random}${ext}`;
  const finalPath = path.join(VIDEOS_DIR, finalFilename);
  // High buffer (4MB) for ultra-fast disk assembly of multi-GB files
  const writeStream = fs.createWriteStream(finalPath, { flags: 'w', highWaterMark: 4 * 1024 * 1024 });

  for (let i = 0; i < info.totalChunks; i++) {
    const chunkPath = getChunkPath(uploadId, i);
    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(chunkPath, { highWaterMark: 4 * 1024 * 1024 });
      readStream.on('error', reject);
      readStream.on('end', async () => {
        try {
          if (await fs.pathExists(chunkPath)) {
            await fs.remove(chunkPath);
          }
        } catch (e) {}
        resolve();
      });
      readStream.pipe(writeStream, { end: false });
    });
  }

  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
    writeStream.end();
  });

  await fs.remove(getInfoPath(uploadId));

  return {
    filename: finalFilename,
    filepath: `/uploads/videos/${finalFilename}`,
    fullPath: finalPath,
    originalName: info.filename,
    fileSize: info.fileSize
  };
}

async function cleanupUpload(uploadId) {
  try {
    const info = await getUploadInfo(uploadId);
    const total = info ? info.totalChunks : 300;
    for (let i = 0; i < total; i++) {
      const chunkPath = getChunkPath(uploadId, i);
      if (await fs.pathExists(chunkPath)) {
        await fs.remove(chunkPath);
      }
    }
    const infoPath = getInfoPath(uploadId);
    if (await fs.pathExists(infoPath)) {
      await fs.remove(infoPath);
    }
  } catch (e) {}
}

async function cleanupOldUploads(maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    const now = Date.now();
    const activeUploadIds = new Set();

    // 1. Clean Stale / Abandoned Sessions (Only if Inactive for > 24 Hours)
    if (await fs.pathExists(INFO_DIR)) {
      const files = await fs.readdir(INFO_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const infoPath = path.join(INFO_DIR, file);
          try {
            const stat = await fs.stat(infoPath);
            const info = await fs.readJson(infoPath);
            const lastActivity = Math.max(info.lastActivity || 0, info.createdAt || 0, stat.mtimeMs || 0);
            if (info.status !== 'completed' && (now - lastActivity) > maxAgeMs) {
              console.log(`[ChunkUploadService] Cleaning up stale upload session: ${info.uploadId} (Inactive for > 24h)`);
              await cleanupUpload(info.uploadId);
            } else {
              activeUploadIds.add(info.uploadId);
            }
          } catch (e) {
            await fs.remove(infoPath);
          }
        }
      }
    }

    // 2. Orphan Chunk Sweeper (Chunks without active info JSON or older than 24 hours)
    if (await fs.pathExists(TEMP_DIR)) {
      const tempFiles = await fs.readdir(TEMP_DIR);
      for (const file of tempFiles) {
        if (file === 'info') continue;
        const filePath = path.join(TEMP_DIR, file);
        try {
          const stat = await fs.stat(filePath);
          if (stat.isFile()) {
            const uploadIdMatch = file.match(/^([a-f0-9]{32})_chunk_/i);
            const isOrphan = uploadIdMatch ? !activeUploadIds.has(uploadIdMatch[1]) : true;
            const isExpired = (now - stat.mtimeMs) > maxAgeMs;

            if (isOrphan || isExpired) {
              await fs.remove(filePath);
            }
          }
        } catch (e) {}
      }
    }
  } catch (error) {
    console.error('Error cleaning up old uploads:', error);
  }
}

const uploadSpeedTracker = new Map();

function recordChunkSpeed(uploadId, bytes) {
  const now = Date.now();
  if (!uploadSpeedTracker.has(uploadId)) {
    uploadSpeedTracker.set(uploadId, []);
  }
  const samples = uploadSpeedTracker.get(uploadId);
  samples.push({ time: now, bytes });
  const cutoff = now - 180 * 1000;
  while (samples.length > 0 && samples[0].time < cutoff) {
    samples.shift();
  }
}

function formatBytesSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  const mb = bytesPerSec / (1024 * 1024);
  const mbps = (bytesPerSec * 8) / (1000 * 1000);
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB/s (${mbps.toFixed(1)} Mbps)`;
  }
  const kb = bytesPerSec / 1024;
  return `${kb.toFixed(0)} KB/s (${mbps.toFixed(1)} Mbps)`;
}

function formatEtaDuration(seconds) {
  if (!seconds || seconds <= 0) return '--';
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}j ${m}m`;
  }
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  return `${seconds}s`;
}

function calculateSpeedAndEta(uploadId, info, uploadedBytes, chunkStats = []) {
  const now = Date.now();
  let speedBps = 0;

  // 1. Calculate from in-memory recent chunk samples if available
  const samples = uploadSpeedTracker.get(uploadId) || [];
  if (samples.length >= 2) {
    const timeSpan = (samples[samples.length - 1].time - samples[0].time) / 1000;
    if (timeSpan > 2) {
      let totalBytesInWindow = 0;
      for (let i = 1; i < samples.length; i++) {
        totalBytesInWindow += samples[i].bytes;
      }
      speedBps = totalBytesInWindow / timeSpan;
    }
  }

  // 2. Fallback / Instant: Calculate from recent filesystem chunk arrival timestamps (top 4 chunks)
  if (speedBps <= 0 && chunkStats && chunkStats.length >= 2) {
    const sorted = [...chunkStats].sort((a, b) => b.mtimeMs - a.mtimeMs);
    const recent = sorted.slice(0, 4);
    if (recent.length >= 2) {
      const newest = recent[0].mtimeMs;
      const oldest = recent[recent.length - 1].mtimeMs;
      const deltaSec = (newest - oldest) / 1000;
      if (deltaSec >= 2) {
        let bytesInRecent = 0;
        for (let i = 0; i < recent.length - 1; i++) {
          bytesInRecent += recent[i].size;
        }
        speedBps = bytesInRecent / deltaSec;
      }
    }
  }

  // 3. Fallback: overall session average speed
  if (speedBps <= 0 && info && info.createdAt && uploadedBytes > 0) {
    const elapsedSec = (now - info.createdAt) / 1000;
    if (elapsedSec > 5) {
      speedBps = uploadedBytes / elapsedSec;
    }
  }

  const speedFormatted = formatBytesSpeed(speedBps);
  const remainingBytes = Math.max(0, (info?.fileSize || 0) - uploadedBytes);
  const etaSeconds = speedBps > 0 && remainingBytes > 0 ? Math.round(remainingBytes / speedBps) : 0;
  const etaFormatted = formatEtaDuration(etaSeconds);

  return {
    speedBps: Math.round(speedBps),
    speedFormatted,
    etaSeconds,
    etaFormatted
  };
}

async function getAllUploadSessions() {
  const sessions = [];
  if (await fs.pathExists(INFO_DIR)) {
    const files = await fs.readdir(INFO_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const infoPath = path.join(INFO_DIR, file);
        try {
          const info = await fs.readJson(infoPath);
          const uploadedChunks = await getUploadedChunksList(info.uploadId, info.totalChunks);
          let uploadedBytes = 0;
          let latestChunkTime = 0;
          const chunkStats = [];
          
          for (const idx of uploadedChunks) {
            const cp = getChunkPath(info.uploadId, idx);
            try {
              const stat = await fs.stat(cp);
              uploadedBytes += stat.size;
              chunkStats.push({ index: idx, mtimeMs: stat.mtimeMs, size: stat.size });
              if (stat.mtimeMs > latestChunkTime) {
                latestChunkTime = stat.mtimeMs;
              }
            } catch (e) {
              uploadedBytes += CHUNK_SIZE;
            }
          }

          let infoMtime = 0;
          try {
            const infoStat = await fs.stat(infoPath);
            infoMtime = infoStat.mtimeMs || 0;
          } catch (e) {}

          const now = Date.now();
          const lastAct = Math.max(
            info.lastActivity || 0,
            info.createdAt || 0,
            latestChunkTime,
            infoMtime
          );

          // Active heartbeat: active as long as session is uploading and has activity within 5 minutes
          const timeSinceLastAct = now - lastAct;
          const isActive = info.status === 'uploading' && (
            (uploadedChunks.length > 0 && timeSinceLastAct < 5 * 60 * 1000) ||
            (uploadedChunks.length === 0 && (now - (info.createdAt || 0)) < 3 * 60 * 1000)
          );

          const progress = (info.fileSize && info.fileSize > 0)
            ? Math.min(100, (uploadedBytes / info.fileSize) * 100).toFixed(1)
            : (info.totalChunks > 0 ? Math.min(100, (uploadedChunks.length / info.totalChunks) * 100).toFixed(1) : 0);

          const speedMetrics = calculateSpeedAndEta(info.uploadId, info, uploadedBytes, chunkStats);

          sessions.push({
            ...info,
            uploadedChunks,
            uploadedChunksCount: uploadedChunks.length,
            uploadedBytes,
            progress: parseFloat(progress),
            isActive,
            lastActivity: lastAct,
            ageMs: timeSinceLastAct,
            ...speedMetrics
          });
        } catch (e) {}
      }
    }
  }
  return sessions;
}

async function getActiveUploads() {
  const all = await getAllUploadSessions();
  return all.filter(s => s.isActive);
}

// Run garbage collection on startup and periodically every 15 minutes
setTimeout(() => {
  cleanupOldUploads(24 * 60 * 60 * 1000);
}, 5000);

setInterval(() => {
  cleanupOldUploads(24 * 60 * 60 * 1000);
}, 15 * 60 * 1000);

module.exports = {
  CHUNK_SIZE,
  initUpload,
  getUploadInfo,
  saveChunk,
  pauseUpload,
  mergeChunks,
  cleanupUpload,
  cleanupOldUploads,
  findExistingUpload,
  getAllUploadSessions,
  getActiveUploads,
  recordChunkSpeed
};

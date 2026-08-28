const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const CHUNK_SIZE = 50 * 1024 * 1024;
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
    const infoPath = getInfoPath(uploadId);
    if (await fs.pathExists(infoPath)) {
      const now = new Date();
      await fs.utimes(infoPath, now, now);
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
  const writeStream = fs.createWriteStream(finalPath, { flags: 'w', highWaterMark: 1024 * 1024 });

  for (let i = 0; i < info.totalChunks; i++) {
    const chunkPath = getChunkPath(uploadId, i);
    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(chunkPath, { highWaterMark: 1024 * 1024 });
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

async function cleanupOldUploads(maxAgeMs = 2 * 60 * 60 * 1000) {
  try {
    const now = Date.now();
    const activeUploadIds = new Set();

    // 1. Clean Stale / Abandoned Sessions (> 2 Hours Inactivity)
    if (await fs.pathExists(INFO_DIR)) {
      const files = await fs.readdir(INFO_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const infoPath = path.join(INFO_DIR, file);
          try {
            const info = await fs.readJson(infoPath);
            const lastActivity = info.lastActivity || info.createdAt || 0;
            if (info.status !== 'completed' && (now - lastActivity) > maxAgeMs) {
              console.log(`[ChunkUploadService] Cleaning up stale upload session: ${info.uploadId} (Inactive for > 2h)`);
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

    // 2. Orphan Chunk Sweeper (Chunks without active info JSON or older than 2 hours)
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
          for (const idx of uploadedChunks) {
            const cp = getChunkPath(info.uploadId, idx);
            try {
              const stat = await fs.stat(cp);
              uploadedBytes += stat.size;
            } catch (e) {
              uploadedBytes += CHUNK_SIZE;
            }
          }
          const progress = info.totalChunks > 0 ? Math.min(100, (uploadedChunks.length / info.totalChunks) * 100).toFixed(1) : 0;
          const lastAct = info.lastActivity || info.createdAt || 0;
          const isActive = (Date.now() - lastAct) < (5 * 60 * 1000) && info.status === 'uploading';
          sessions.push({
            ...info,
            uploadedChunks,
            uploadedChunksCount: uploadedChunks.length,
            uploadedBytes,
            progress: parseFloat(progress),
            isActive,
            ageMs: Date.now() - lastAct
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
  cleanupOldUploads(2 * 60 * 60 * 1000);
}, 5000);

setInterval(() => {
  cleanupOldUploads(2 * 60 * 60 * 1000);
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
  getActiveUploads
};

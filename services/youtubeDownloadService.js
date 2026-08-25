const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const Video = require('../models/Video');
const MediaFolder = require('../models/MediaFolder');

const activeJobs = new Map();
const VIDEOS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'videos');
const THUMBNAILS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'thumbnails');

fs.ensureDirSync(VIDEOS_DIR);
fs.ensureDirSync(THUMBNAILS_DIR);

function getYtDlpRunner() {
  return { cmd: 'python3', prefixArgs: ['-m', 'yt_dlp'] };
}

function formatDuration(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function sanitizeFilename(title) {
  return (title || 'youtube-video')
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 80);
}

function cleanYoutubeUrl(url) {
  if (!url || typeof url !== 'string') return url;
  try {
    const trimmed = url.trim();
    if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
      const parsed = new URL(trimmed);
      const v = parsed.searchParams.get('v');
      if (v) return `https://www.youtube.com/watch?v=${v}`;
      if (parsed.pathname.startsWith('/shorts/')) {
        const id = parsed.pathname.split('/shorts/')[1]?.split('?')[0]?.split('/')[0];
        if (id) return `https://www.youtube.com/watch?v=${id}`;
      }
      if (parsed.hostname === 'youtu.be') {
        const id = parsed.pathname.replace(/^\//, '').split('?')[0];
        if (id) return `https://www.youtube.com/watch?v=${id}`;
      }
    }
    return trimmed;
  } catch (e) {
    return url.trim();
  }
}

function getPotArgs() {
  return [
    '--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416'
  ];
}

function getCookieArgs() {
  const cookiePaths = [
    path.join(__dirname, '..', 'cookies.txt'),
    path.join(__dirname, '..', 'youtube_cookies.txt'),
    path.join(__dirname, '..', 'db', 'cookies.txt')
  ];
  for (const cp of cookiePaths) {
    if (fs.existsSync(cp)) return ['--cookies', cp];
  }
  return [];
}

/**
 * Inspects a YouTube URL and extracts rich metadata and available resolutions.
 */
async function inspectVideo(rawUrl) {
  const url = cleanYoutubeUrl(rawUrl);
  const runner = getYtDlpRunner();
  return new Promise((resolve, reject) => {
    const args = [
      ...runner.prefixArgs,
      '--dump-single-json',
      '--no-warnings',
      '--skip-download',
      '--no-playlist',
      '--geo-bypass',
      ...getPotArgs(),
      ...getCookieArgs(),
      url
    ];

    execFile(runner.cmd, args, { maxBuffer: 10 * 1024 * 1024, timeout: 35000 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(stderr || error.message || 'Failed to inspect YouTube URL'));
      }

      try {
        const info = JSON.parse(stdout);
        const formats = info.formats || [];
        const resolutionMap = new Map();

        const labels = {
          2160: '4K Ultra HD (2160p)',
          1440: '2K Quad HD (1440p)',
          1080: 'Full HD (1080p)',
          720: 'HD (720p)',
          480: 'SD (480p)',
          360: 'SD (360p)',
          240: 'Low (240p)',
          144: 'Low (144p)'
        };

        formats.forEach(f => {
          if (f.height && f.vcodec && f.vcodec !== 'none') {
            const h = f.height;
            const fps = f.fps ? `${f.fps}fps` : '';
            const label = labels[h] || `${h}p ${fps}`.trim();
            if (!resolutionMap.has(h)) {
              resolutionMap.set(h, {
                height: h,
                label: (f.fps && f.fps > 30) ? `${label} 60fps` : label,
                ext: 'mp4',
                type: 'video'
              });
            }
          }
        });

        const sortedResolutions = Array.from(resolutionMap.values())
          .sort((a, b) => b.height - a.height);

        // Always provide Audio Only option
        sortedResolutions.push({
          height: 'audio',
          label: 'Audio Only (MP3 Best Quality)',
          ext: 'mp3',
          type: 'audio'
        });

        const defaultRes = sortedResolutions.find(r => r.height === 1080) || sortedResolutions[0];

        const result = {
          id: info.id,
          title: info.title || 'Untitled Video',
          channel: info.uploader || info.channel || 'YouTube',
          duration: info.duration || 0,
          durationFormatted: formatDuration(info.duration),
          thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails[0]?.url) || '',
          url: info.webpage_url || url,
          resolutions: sortedResolutions,
          defaultResolution: defaultRes ? defaultRes.height : 720
        };

        resolve(result);
      } catch (err) {
        reject(new Error('Failed to parse YouTube metadata'));
      }
    });
  });
}

/**
 * Starts a background batch download job for one or more YouTube videos.
 */
function startDownloadJob(userId, queueItems, folderId = null) {
  const jobId = uuidv4();
  const job = {
    id: jobId,
    userId,
    folderId,
    status: 'downloading',
    totalItems: queueItems.length,
    currentIndex: 0,
    progress: 0,
    currentProgress: 0,
    speed: '',
    eta: '',
    currentItemTitle: queueItems[0]?.title || 'Starting download...',
    downloadedFiles: [],
    childProcess: null,
    error: null,
    createdAt: Date.now()
  };

  activeJobs.set(jobId, job);
  processJobQueue(jobId, queueItems).catch(err => {
    console.error(`[YouTubeDownloader] Job ${jobId} failed:`, err);
    job.status = 'failed';
    job.error = err.message;
  });

  return jobId;
}

async function processJobQueue(jobId, queueItems) {
  const job = activeJobs.get(jobId);
  if (!job) return;

  const runner = getYtDlpRunner();

  for (let i = 0; i < queueItems.length; i++) {
    if (job.status === 'cancelled') break;

    const item = queueItems[i];
    job.currentIndex = i;
    job.currentItemTitle = item.title || `Item ${i + 1}`;
    job.currentProgress = 0;

    const isAudio = item.resolution === 'audio' || item.resolution === 0 || item.resolution === '0';
    const height = parseInt(item.resolution, 10) || 1080;
    const baseName = sanitizeFilename(item.title);
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    const ext = isAudio ? 'mp3' : 'mp4';
    const finalFilename = `${baseName}-${timestamp}-${random}.${ext}`;
    const finalFilePath = path.join(VIDEOS_DIR, finalFilename);

    let formatArg;
    if (isAudio) {
      formatArg = [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--no-playlist'
      ];
    } else {
      formatArg = [
        '-f', `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`,
        '--merge-output-format', 'mp4',
        '--no-playlist'
      ];
    }

    const cleanedUrl = cleanYoutubeUrl(item.url);
    const runner = getYtDlpRunner();
    const args = [
      ...runner.prefixArgs,
      ...formatArg,
      '--newline',
      '--progress-template', '%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
      '--geo-bypass',
      ...getPotArgs(),
      ...getCookieArgs(),
      '-o', finalFilePath,
      cleanedUrl
    ];

    await new Promise((resolve, reject) => {
      const child = spawn(runner.cmd, args);
      job.childProcess = child;

      child.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.includes('|')) {
            const parts = trimmed.split('|');
            const pctStr = parts[0]?.replace('%', '').trim();
            const pct = parseFloat(pctStr);
            if (!isNaN(pct)) {
              job.currentProgress = Math.min(100, Math.max(0, pct));
              job.speed = parts[1]?.trim() || '';
              job.eta = parts[2]?.trim() || '';
              
              const overall = Math.round(((i + (job.currentProgress / 100)) / queueItems.length) * 100);
              job.progress = overall;
            }
          }
        }
      });

      child.stderr.on('data', (data) => {});

      child.on('close', (code) => {
        job.childProcess = null;
        if (code === 0) {
          resolve();
        } else {
          if (job.status === 'cancelled') {
            resolve();
          } else {
            reject(new Error(`yt-dlp exited with code ${code}`));
          }
        }
      });

      child.on('error', (err) => {
        job.childProcess = null;
        reject(err);
      });
    });

    if (job.status === 'cancelled') {
      try {
        if (await fs.pathExists(finalFilePath)) await fs.remove(finalFilePath);
      } catch (e) {}
      break;
    }

    if (await fs.pathExists(finalFilePath)) {
      const stat = await fs.stat(finalFilePath);
      const thumbnailFilename = `thumb-${path.parse(finalFilename).name}.jpg`;
      const thumbnailPath = `/uploads/thumbnails/${thumbnailFilename}`;
      const thumbDiskPath = path.join(THUMBNAILS_DIR, thumbnailFilename);

      const meta = await extractMetadata(finalFilePath, thumbDiskPath, isAudio);

      const videoData = {
        title: item.title || path.parse(finalFilename).name,
        filepath: `/uploads/videos/${finalFilename}`,
        thumbnail_path: meta.thumbnail_path || (isAudio ? '/images/default-video-thumbnail.svg' : thumbnailPath),
        file_size: stat.size,
        duration: meta.duration || item.duration || 0,
        format: ext,
        resolution: isAudio ? '' : (meta.resolution || `${height}p`),
        bitrate: meta.bitrate || null,
        fps: meta.fps || null,
        user_id: job.userId,
        folder_id: job.folderId || null
      };

      const createdVideo = await Video.create(videoData);
      job.downloadedFiles.push(createdVideo);
    }
  }

  if (job.status !== 'cancelled') {
    job.status = 'completed';
    job.progress = 100;
  }
}

function extractMetadata(filePath, thumbDiskPath, isAudio) {
  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (data) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(data);
      }
    };

    const timer = setTimeout(() => {
      safeResolve({ duration: 0, resolution: '', bitrate: null, fps: null, thumbnail_path: '/images/default-video-thumbnail.svg' });
    }, 15000);

    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata) {
        return safeResolve({ duration: 0, resolution: '', bitrate: null, fps: null, thumbnail_path: '/images/default-video-thumbnail.svg' });
      }

      let duration = metadata.format && metadata.format.duration ? Math.round(metadata.format.duration) : 0;
      let bitrate = metadata.format && metadata.format.bit_rate ? Math.round(parseInt(metadata.format.bit_rate) / 1000) : null;
      let resolution = '';
      let fps = null;
      let videoStream = null;

      if (Array.isArray(metadata.streams)) {
        videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (videoStream) {
          resolution = `${videoStream.width}x${videoStream.height}`;
          if (videoStream.avg_frame_rate) {
            const r = videoStream.avg_frame_rate.split('/');
            if (r.length === 2 && parseInt(r[1]) !== 0) {
              fps = Math.round((parseInt(r[0]) / parseInt(r[1])) * 100) / 100;
            }
          }
        }
      }

      if (isAudio || !videoStream) {
        return safeResolve({
          duration,
          resolution: '',
          bitrate,
          fps: null,
          thumbnail_path: '/images/default-video-thumbnail.svg'
        });
      }

      ffmpeg(filePath)
        .screenshots({
          timestamps: ['10%'],
          filename: path.basename(thumbDiskPath),
          folder: path.dirname(thumbDiskPath),
          size: '854x?'
        })
        .on('end', () => {
          safeResolve({
            duration,
            resolution,
            bitrate,
            fps,
            thumbnail_path: `/uploads/thumbnails/${path.basename(thumbDiskPath)}`
          });
        })
        .on('error', () => {
          safeResolve({
            duration,
            resolution,
            bitrate,
            fps,
            thumbnail_path: '/images/default-video-thumbnail.svg'
          });
        });
    });
  });
}

function getJobStatus(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    currentProgress: job.currentProgress,
    currentIndex: job.currentIndex,
    totalItems: job.totalItems,
    currentItemTitle: job.currentItemTitle,
    speed: job.speed,
    eta: job.eta,
    filesCount: job.downloadedFiles.length,
    error: job.error
  };
}

function cancelJob(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) return false;
  job.status = 'cancelled';
  if (job.childProcess) {
    try {
      job.childProcess.kill('SIGTERM');
    } catch (e) {}
  }
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of activeJobs.entries()) {
    if ((now - job.createdAt) > 3600000 && job.status !== 'downloading') {
      activeJobs.delete(jobId);
    }
  }
}, 15 * 60 * 1000);

module.exports = {
  inspectVideo,
  startDownloadJob,
  getJobStatus,
  cancelJob
};

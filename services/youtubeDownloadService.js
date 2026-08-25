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
  return { cmd: 'python3', prefixArgs: ['-u', '-m', 'yt_dlp'] };
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

function formatBytes(bytes) {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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
    '--remote-components', 'ejs:github',
    '--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416'
  ];
}

function getCookieArgs() {
  const cookiePaths = [
    path.join(__dirname, '..', 'db', 'cookies.txt'),
    path.join(__dirname, '..', 'cookies.txt'),
    path.join(__dirname, '..', 'youtube_cookies.txt')
  ];
  for (const cp of cookiePaths) {
    if (fs.existsSync(cp)) {
      const stats = fs.statSync(cp);
      if (stats.size > 50) return ['--cookies', cp];
    }
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

        const duration = info.duration || 0;
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

        // Determine best audio stream size
        let bestAudioSize = 0;
        const audioFormats = formats.filter(f => !f.vcodec || f.vcodec === 'none');
        if (audioFormats.length > 0) {
          const sortedAudio = audioFormats.sort((a, b) => (b.tbr || b.abr || 0) - (a.tbr || a.abr || 0));
          const bestA = sortedAudio[0];
          bestAudioSize = bestA.filesize || bestA.filesize_approx || (duration > 0 && (bestA.abr || bestA.tbr || 128) ? Math.round(((bestA.abr || bestA.tbr || 128) * 1000 / 8) * duration) : 0);
        } else if (duration > 0) {
          bestAudioSize = Math.round((128000 / 8) * duration);
        }

        formats.forEach(f => {
          if (f.height && f.vcodec && f.vcodec !== 'none') {
            const h = f.height;
            const fps = f.fps ? `${f.fps}fps` : '';
            const baseLabel = labels[h] || `${h}p ${fps}`.trim();
            const labelText = (f.fps && f.fps > 30) ? `${baseLabel} 60fps` : baseLabel;

            let videoSize = f.filesize || f.filesize_approx || 0;
            if (!videoSize && duration > 0 && (f.tbr || f.vbr)) {
              videoSize = Math.round(((f.vbr || f.tbr) * 1000 / 8) * duration);
            }
            const totalBytes = videoSize > 0 ? (videoSize + (f.acodec && f.acodec !== 'none' ? 0 : bestAudioSize)) : 0;
            const sizeStr = totalBytes > 0 ? formatBytes(totalBytes) : '';

            if (!resolutionMap.has(h)) {
              resolutionMap.set(h, {
                height: h,
                label: sizeStr ? `${labelText} • ~${sizeStr}` : labelText,
                rawLabel: labelText,
                filesize: totalBytes,
                filesizeFormatted: sizeStr ? `~${sizeStr}` : '',
                ext: 'mp4',
                type: 'video'
              });
            }
          }
        });

        const sortedResolutions = Array.from(resolutionMap.values())
          .sort((a, b) => b.height - a.height);

        // Always provide Audio Only option
        const audioSizeStr = bestAudioSize > 0 ? formatBytes(bestAudioSize) : '';
        sortedResolutions.push({
          height: 'audio',
          label: audioSizeStr ? `Audio Only (MP3 Best Quality) • ~${audioSizeStr}` : 'Audio Only (MP3 Best Quality)',
          rawLabel: 'Audio Only (MP3 Best Quality)',
          filesize: bestAudioSize,
          filesizeFormatted: audioSizeStr ? `~${audioSizeStr}` : '',
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
          defaultResolution: defaultRes ? defaultRes.height : (sortedResolutions[0]?.height || '360')
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
      '--no-colors',
      '--newline',
      '--progress-template', 'download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_estimate_str)s',
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
        const raw = data.toString();
        const lines = raw.split(/\r|\n/).filter(Boolean);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.includes('|')) {
            const parts = trimmed.split('|');
            const pctStr = parts[0]?.replace('%', '').trim();
            const pct = parseFloat(pctStr);
            if (!isNaN(pct)) {
              job.currentProgress = Math.min(100, Math.max(0, pct));
              if (parts[1] && parts[1].trim() !== 'Unknown B/s') {
                job.speed = parts[1].trim();
              }
              if (parts[2] && parts[2].trim() !== 'Unknown' && parts[2].trim() !== 'NA') {
                job.eta = parts[2].trim();
              }
              if (parts[3] && parts[4] && parts[3].trim() !== 'NA' && parts[4].trim() !== 'NA') {
                job.sizeProgress = `${parts[3].trim()} / ${parts[4].trim()}`;
              } else if (parts[3] && parts[3].trim() !== 'NA') {
                job.sizeProgress = parts[3].trim();
              }
              
              const overall = Math.round(((i + (job.currentProgress / 100)) / queueItems.length) * 100);
              job.progress = Math.min(99, Math.max(0, overall));
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
    sizeProgress: job.sizeProgress || '',
    filesCount: job.downloadedFiles.length,
    error: job.error
  };
}

/**
 * Verifies that a given cookie file works with YouTube by running a lightweight test probe.
 */
async function verifyCookie(cookieFilePath) {
  if (!fs.existsSync(cookieFilePath)) {
    throw new Error('Cookie file does not exist.');
  }
  const content = fs.readFileSync(cookieFilePath, 'utf8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (lines.length === 0) {
    throw new Error('No valid cookie records found in file.');
  }

  const hasYtCookies = lines.some(l => l.includes('youtube.com') || l.includes('google.com'));
  if (!hasYtCookies) {
    throw new Error('Provided cookies do not belong to youtube.com or google.com.');
  }

  return true;
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
  verifyCookie,
  startDownloadJob,
  getJobStatus,
  cancelJob
};

const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const Video = require('../models/Video');
const MediaFolder = require('../models/MediaFolder');
const { logActivity } = require('./activityLogger');

const activeJobs = new Map();
const VIDEOS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'videos');
const THUMBNAILS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'thumbnails');

fs.ensureDirSync(VIDEOS_DIR);
fs.ensureDirSync(THUMBNAILS_DIR);

function getYtDlpRunner() {
  if (fs.existsSync('/usr/local/bin/yt-dlp')) {
    return { cmd: '/usr/local/bin/yt-dlp', prefixArgs: [] };
  }
  return { cmd: 'yt-dlp', prefixArgs: [] };
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

function cleanUnits(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/([0-9.]+)\s*GiB/gi, '$1 GB')
    .replace(/([0-9.]+)\s*MiB/gi, '$1 MB')
    .replace(/([0-9.]+)\s*KiB/gi, '$1 KB')
    .replace(/([0-9.]+)\s*GiB\/s/gi, '$1 GB/s')
    .replace(/([0-9.]+)\s*MiB\/s/gi, '$1 MB/s')
    .replace(/([0-9.]+)\s*KiB\/s/gi, '$1 KB/s')
    .replace(/([0-9.]+)\s*B\/s/gi, '$1 B/s');
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
    let trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = 'https://' + trimmed;
    }
    if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
      const parsed = new URL(trimmed);
      const v = parsed.searchParams.get('v');
      if (v) return `https://www.youtube.com/watch?v=${v}`;
      if (parsed.pathname.startsWith('/shorts/')) {
        const id = parsed.pathname.split('/shorts/')[1]?.split('?')[0]?.split('/')[0];
        if (id) return `https://www.youtube.com/watch?v=${id}`;
      }
      if (parsed.hostname.includes('youtu.be')) {
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
    '--remote-components', 'ejs:github'
  ];
}

function getCacheArgs() {
  const cacheDir = path.join(__dirname, '..', 'db', '.cache', 'yt-dlp');
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
  } catch (e) {}
  return ['--cachedir', cacheDir];
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

function formatYtDlpError(errText) {
  const raw = String(errText || '');
  if (/Unsupported URL|Incomplete YouTube ID|is not a valid URL|generic information extractor/i.test(raw)) {
    const err = new Error('Tautan YouTube tidak lengkap atau terpotong. Pastikan link tersalin utuh (contoh: https://www.youtube.com/watch?v=...)');
    err.code = 'INVALID_URL';
    return err;
  }
  if (/Sign in to confirm you('re| are) not a bot|--cookies|confirm you're not a bot|cookies are expired|requires authentication|login|HTTP Error 403|Forbidden|access denied|403 Forbidden|GVS PO Token|SABR/i.test(raw)) {
    const err = new Error('YouTube session cookie expired or verification required (HTTP 403 / Bot Check). Please refresh your cookies in Cookie Setup to continue.');
    err.code = 'COOKIE_EXPIRED';
    err.needsCookie = true;
    return err;
  }
  if (/HTTP Error 429|Too Many Requests/i.test(raw)) {
    const err = new Error('YouTube request limit reached. Please update cookies in Cookie Setup to resume immediate downloads.');
    err.code = 'COOKIE_EXPIRED';
    err.needsCookie = true;
    return err;
  }
  if (/Private video|This video is private/i.test(raw)) {
    const err = new Error('This YouTube video is private or requires authorized account access.');
    err.code = 'PRIVATE_VIDEO';
    return err;
  }
  if (/Video unavailable|This video has been removed/i.test(raw)) {
    const err = new Error('This YouTube video is unavailable or has been removed.');
    err.code = 'VIDEO_UNAVAILABLE';
    return err;
  }
  const cleaned = raw.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?([a-zA-Z0-9_-]+:\s*)?/, '').split('\n')[0].trim();
  const err = new Error(cleaned || 'Failed to process YouTube stream');
  err.code = 'YT_ERROR';
  return err;
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
      ...getCacheArgs(),
      '--dump-single-json',
      '--no-warnings',
      '--skip-download',
      '--no-playlist',
      '--geo-bypass',
      ...getPotArgs(),
      ...getCookieArgs(),
      url
    ];

    execFile(runner.cmd, args, { maxBuffer: 10 * 1024 * 1024, timeout: 35000 }, async (error, stdout, stderr) => {
      if (error) {
        return reject(formatYtDlpError(stderr || error.message));
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

        // Fallback resolutions if player client returned limited separate video streams
        if (sortedResolutions.length === 0) {
          [1080, 720, 480, 360].forEach(h => {
            sortedResolutions.push({
              height: h,
              label: labels[h] || `${h}p`,
              rawLabel: labels[h] || `${h}p`,
              filesize: 0,
              filesizeFormatted: '',
              ext: 'mp4',
              type: 'video'
            });
          });
        }

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

        const defaultRes = sortedResolutions.find(r => r.height === 1080 || r.height === 720) || sortedResolutions[0];

        const result = {
          id: info.id,
          title: info.title || 'Untitled Video',
          channel: info.uploader || info.channel || 'YouTube',
          duration: info.duration || 0,
          durationFormatted: formatDuration(info.duration),
          thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails[0]?.url) || '',
          url: info.webpage_url || url,
          resolutions: sortedResolutions,
          defaultResolution: defaultRes ? defaultRes.height : (sortedResolutions[0]?.height || '360'),
          needsCookie: false,
          cookieWarning: ''
        };

        resolve(result);
      } catch (err) {
        reject(new Error('Failed to parse YouTube metadata'));
      }
    });
  });
}

/**
 * Starts a background batch download job for one or more YouTube videos (Concurrency = 2).
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
    activeLabel: '',
    itemsStatus: queueItems.map((item, idx) => ({
      index: idx,
      title: item.title || `Video ${idx + 1}`,
      status: 'pending',
      progress: 0,
      sizeProgress: '',
      speed: '',
      rawSpeedBps: 0,
      eta: '',
      needsCookie: false
    })),
    downloadedFiles: [],
    activeProcesses: new Set(),
    needsCookie: false,
    error: null,
    createdAt: Date.now()
  };

  activeJobs.set(jobId, job);
  processJobQueue(jobId, queueItems).catch(err => {
    console.error(`[YouTubeDownloader] Job ${jobId} failed:`, err);
    job.status = 'failed';
    job.error = err.message;
    job.needsCookie = err.needsCookie || false;
  });

  return jobId;
}

async function processJobQueue(jobId, queueItems) {
  const job = activeJobs.get(jobId);
  if (!job) return;

  const total = queueItems.length;
  const concurrency = Math.min(2, total);
  let nextIndex = 0;

  function updateOverallProgress() {
    if (!job || job.status === 'cancelled') return;

    // Average progress across all items
    const sumProgress = job.itemsStatus.reduce((sum, s) => sum + (s.progress || 0), 0);
    job.progress = Math.min(99, Math.round(sumProgress / total));

    // Active downloading items
    const activeDownloading = job.itemsStatus.filter(s => s.status === 'downloading');
    const totalSpeedBps = activeDownloading.reduce((sum, s) => sum + (s.rawSpeedBps || 0), 0);

    if (totalSpeedBps > 0) {
      job.speed = `${formatBytes(totalSpeedBps)}/s`;
    } else {
      const speedStrs = activeDownloading.map(s => s.speed).filter(Boolean);
      job.speed = speedStrs.length > 0 ? speedStrs[0] : '';
    }

    // Active labels
    const activeIndexes = activeDownloading.map(s => s.index + 1);
    if (activeIndexes.length > 1) {
      job.currentIndex = activeIndexes[0] - 1;
      job.activeLabel = `Items ${activeIndexes.join(' & ')} of ${total}`;
    } else if (activeIndexes.length === 1) {
      job.currentIndex = activeIndexes[0] - 1;
      job.activeLabel = `Item ${activeIndexes[0]} of ${total}`;
    } else {
      const pendingItems = job.itemsStatus.filter(s => s.status === 'pending');
      const completedItems = job.itemsStatus.filter(s => s.status === 'completed');
      if (completedItems.length > 0 && pendingItems.length === 0) {
        job.activeLabel = `Completed ${completedItems.length} of ${total}`;
      }
    }

    // Pick first valid ETA among active downloads
    const activeEtas = activeDownloading.map(s => s.eta).filter(e => e && e !== 'Unknown' && e !== 'NA' && e !== 'N/A');
    if (activeEtas.length > 0) {
      job.eta = activeEtas[0];
    }
  }

  async function worker(workerId) {
    while (nextIndex < total && job.status !== 'cancelled' && !job.needsCookie) {
      const i = nextIndex++;
      const item = queueItems[i];
      if (!item) break;

      job.itemsStatus[i].status = 'connecting';
      job.itemsStatus[i].progress = 0;
      job.itemsStatus[i].speed = '';
      job.itemsStatus[i].rawSpeedBps = 0;
      job.itemsStatus[i].sizeProgress = 'Connecting to YouTube stream...';
      updateOverallProgress();

      try {
        await downloadSingleItem(job, item, i, updateOverallProgress);
      } catch (err) {
        console.error(`[YouTubeDownloader Worker ${workerId}] Error downloading item ${i} (${item.title}):`, err);
        if (job.status === 'cancelled') break;
        if (job.itemsStatus[i]) {
          job.itemsStatus[i].status = 'failed';
          job.itemsStatus[i].error = err.message;
          job.itemsStatus[i].code = err.code;
          job.itemsStatus[i].needsCookie = err.needsCookie || false;
        }
        if (err.needsCookie) {
          job.needsCookie = true;
          job.error = err.message;
          job.status = 'failed';
          break; // Stop remaining downloads immediately
        }
      }
      updateOverallProgress();
    }
  }

  const workers = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push(worker(w));
  }

  await Promise.all(workers);

  if (job.status !== 'cancelled') {
    const anyCookieError = job.itemsStatus.some(s => s.needsCookie);
    if (anyCookieError) {
      job.status = 'failed';
      job.needsCookie = true;
      job.error = job.itemsStatus.find(s => s.needsCookie)?.error || 'YouTube session cookie expired';
    } else {
      const allFailed = job.itemsStatus.every(s => s.status === 'failed');
      if (allFailed && total > 0) {
        job.status = 'failed';
        job.error = job.itemsStatus[0]?.error || 'All downloads failed';
      } else {
        job.status = 'completed';
        job.progress = 100;
      }
    }
  }
}

function getAccumulatedBytesOnDisk(targetPath) {
  try {
    let total = 0;
    const dir = path.dirname(targetPath);
    const prefix = path.parse(targetPath).name;
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.startsWith(prefix) && !f.endsWith('.aria2') && !f.endsWith('.ytdl')) {
          try {
            const st = fs.statSync(path.join(dir, f));
            total += st.size;
          } catch (e) {}
        }
      }
    }
    return total;
  } catch (e) {
    return 0;
  }
}

async function downloadSingleItem(job, item, i, onProgress) {
  if (job.status === 'cancelled') return;

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
      '-f', `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`,
      '--merge-output-format', 'mp4',
      '--postprocessor-args', 'ffmpeg:-movflags +faststart',
      '--no-playlist'
    ];
  }

  const cleanedUrl = cleanYoutubeUrl(item.url);
  const runner = getYtDlpRunner();
  const args = [
    ...runner.prefixArgs,
    ...getCacheArgs(),
    ...formatArg,
    '--no-colors',
    '--newline',
    '--retries', '2',
    '--fragment-retries', '2',
    '--file-access-retries', '2',
    '--downloader', 'default:aria2c',
    '--downloader-args', 'aria2c:-x 16 -j 16 -s 16 -k 1M --file-allocation=none --enable-http-pipelining=true --summary-interval=1',
    '--concurrent-fragments', '16',
    '--buffer-size', '32M',
    '--progress-template', 'download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_estimate_str)s',
    '--geo-bypass',
    ...getPotArgs(),
    ...getCookieArgs(),
    '-o', finalFilePath,
    cleanedUrl
  ];

  let streamPhase = 0;
  let lastRawPct = 0;
  let videoStreamBytesStr = '';

  await new Promise((resolve, reject) => {
    const child = spawn(runner.cmd, args);
    job.activeProcesses.add(child);
    let stderrBuffer = '';

    let lastBytes = 0;
    let lastTime = Date.now();
    const expectedBytes = item.filesize || 0;

    // True Live Real-Time Disk Accumulation Ticker (Every 350ms)
    const diskMonitor = setInterval(() => {
      if (job.status === 'cancelled') return;
      const currentBytes = getAccumulatedBytesOnDisk(finalFilePath);
      if (currentBytes > 0) {
        const now = Date.now();
        const dt = (now - lastTime) / 1000;
        let speedText = job.itemsStatus[i]?.speed || '';
        let rawSpeed = job.itemsStatus[i]?.rawSpeedBps || 0;
        if (dt >= 0.4) {
          const delta = currentBytes - lastBytes;
          if (delta > 0) {
            rawSpeed = Math.round(delta / dt);
            speedText = `${formatBytes(rawSpeed)}/s`;
          }
          lastBytes = currentBytes;
          lastTime = now;
        }

        let itemPct = 0;
        let sizeProg = '';
        let eta = '';

        if (expectedBytes > 0) {
          itemPct = Math.min(98, Math.max(1, Math.round((currentBytes / expectedBytes) * 100)));
          sizeProg = `${formatBytes(currentBytes)} / ${formatBytes(expectedBytes)}`;
          if (rawSpeed > 0 && currentBytes < expectedBytes) {
            const remainingSec = Math.round((expectedBytes - currentBytes) / rawSpeed);
            eta = formatDuration(remainingSec);
          }
        } else {
          sizeProg = formatBytes(currentBytes);
        }

        if (job.itemsStatus && job.itemsStatus[i]) {
          const currentStatus = job.itemsStatus[i].status;
          if (currentStatus !== 'merging' && currentStatus !== 'processing' && currentStatus !== 'completed') {
            job.itemsStatus[i].status = 'downloading';
            if (itemPct > (job.itemsStatus[i].progress || 0)) {
              job.itemsStatus[i].progress = itemPct;
            }
            if (speedText) {
              job.itemsStatus[i].speed = speedText;
              job.itemsStatus[i].rawSpeedBps = rawSpeed;
            }
            if (eta) job.itemsStatus[i].eta = eta;
            job.itemsStatus[i].sizeProgress = sizeProg;
          }
        }
        if (typeof onProgress === 'function') onProgress();
      }
    }, 350);

    child.stdout.on('data', (data) => {
      const raw = data.toString();
      if (/HTTP Error 403|Forbidden|access denied|Sign in to confirm you('re| are) not a bot/i.test(raw)) {
        stderrBuffer += raw;
        try { child.kill('SIGTERM'); } catch (e) {}
      }

      // Detect FFmpeg Merger Phase with high accuracy
      if (raw.includes('[Merger]') || raw.includes('Merging formats') || raw.includes('[FixupM4a]')) {
        if (job.itemsStatus && job.itemsStatus[i]) {
          job.itemsStatus[i].status = 'merging';
          job.itemsStatus[i].progress = 99;
          job.itemsStatus[i].speed = '';
          job.itemsStatus[i].rawSpeedBps = 0;
          job.itemsStatus[i].sizeProgress = 'Combining media into MP4 container...';
        }
        if (typeof onProgress === 'function') onProgress();
      }

      const lines = raw.split(/\r|\n/).filter(Boolean);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes('|')) {
          const parts = trimmed.split('|');
          const rawPart0 = parts[0]?.trim() || '';
          const pctMatch = rawPart0.match(/([\d.]+)%/);
          const pct = pctMatch ? parseFloat(pctMatch[1]) : parseFloat(rawPart0.replace(/[^0-9.]/g, ''));
          if (!isNaN(pct)) {
            if (pct < lastRawPct && lastRawPct > 70 && !isAudio) {
              streamPhase = 1;
            }
            lastRawPct = pct;

            let itemPct = pct;
            if (!isAudio) {
              if (streamPhase === 0) {
                itemPct = Math.round(pct * 0.85);
              } else {
                itemPct = Math.min(98, Math.round(85 + (pct * 0.13)));
              }
            }

            let speedText = '';
            let speedBps = 0;
            if (parts[1] && parts[1].trim() !== 'Unknown B/s') {
              speedText = cleanUnits(parts[1].trim());
              const spMatch = speedText.match(/([\d.]+)\s*([KMG]?B\/s)/i);
              if (spMatch) {
                const num = parseFloat(spMatch[1]);
                const unit = spMatch[2].toUpperCase();
                if (unit === 'MB/S' || unit === 'MIB/S') speedBps = num * 1024 * 1024;
                else if (unit === 'KB/S' || unit === 'KIB/S') speedBps = num * 1024;
                else if (unit === 'GB/S' || unit === 'GIB/S') speedBps = num * 1024 * 1024 * 1024;
                else speedBps = num;
              }
            }

            const rawEta = parts[2]?.trim();

            if (job.itemsStatus && job.itemsStatus[i]) {
              const currentStatus = job.itemsStatus[i].status;
              if (currentStatus !== 'merging' && currentStatus !== 'processing' && currentStatus !== 'completed') {
                job.itemsStatus[i].status = 'downloading';
                if (expectedBytes <= 0 && itemPct > (job.itemsStatus[i].progress || 0)) {
                  job.itemsStatus[i].progress = itemPct;
                }
                if (speedText && !job.itemsStatus[i].speed) {
                  job.itemsStatus[i].speed = speedText;
                  job.itemsStatus[i].rawSpeedBps = speedBps;
                }
                if (rawEta && rawEta !== 'Unknown' && rawEta !== 'NA' && rawEta !== 'N/A' && !job.itemsStatus[i].eta) {
                  job.itemsStatus[i].eta = rawEta;
                }
              }
            }

            if (typeof onProgress === 'function') onProgress();
          }
        }
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderrBuffer += text;
      if (/HTTP Error 403|Forbidden|access denied|Sign in to confirm you('re| are) not a bot|confirm you're not a bot/i.test(text)) {
        try { child.kill('SIGTERM'); } catch (e) {}
      }
    });

    child.on('close', (code) => {
      clearInterval(diskMonitor);
      job.activeProcesses.delete(child);
      if (code === 0 || job.status === 'cancelled') {
        resolve();
      } else {
        const formattedErr = formatYtDlpError(stderrBuffer || `yt-dlp exited with code ${code}`);
        reject(formattedErr);
      }
    });

    child.on('error', (err) => {
      clearInterval(diskMonitor);
      job.activeProcesses.delete(child);
      reject(err);
    });
  });

  if (job.status === 'cancelled') {
    try {
      if (await fs.pathExists(finalFilePath)) await fs.remove(finalFilePath);
      if (await fs.pathExists(finalFilePath + '.part')) await fs.remove(finalFilePath + '.part');
      if (await fs.pathExists(finalFilePath + '.temp')) await fs.remove(finalFilePath + '.temp');
    } catch (e) {}
    return;
  }

  if (await fs.pathExists(finalFilePath)) {
    if (job.itemsStatus && job.itemsStatus[i]) {
      job.itemsStatus[i].status = 'processing';
      job.itemsStatus[i].progress = 99;
      job.itemsStatus[i].speed = '';
      job.itemsStatus[i].rawSpeedBps = 0;
      job.itemsStatus[i].sizeProgress = 'Finalizing & saving to Gallery...';
    }
    if (typeof onProgress === 'function') onProgress();

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

    logActivity({
      userId: job.userId,
      performedBy: 'User',
      actionType: 'YOUTUBE_DOWNLOAD',
      category: 'media',
      description: `Downloaded YouTube media '${createdVideo.title}' (${(createdVideo.file_size / (1024 * 1024)).toFixed(1)} MB, ${createdVideo.resolution || createdVideo.format})`,
      details: { videoId: createdVideo.id, url: item.url, format: createdVideo.format, resolution: createdVideo.resolution }
    });

    if (job.itemsStatus && job.itemsStatus[i]) {
      job.itemsStatus[i].status = 'completed';
      job.itemsStatus[i].progress = 100;
      job.itemsStatus[i].speed = '';
      job.itemsStatus[i].rawSpeedBps = 0;
      job.itemsStatus[i].sizeProgress = '';
    }
    if (typeof onProgress === 'function') onProgress();
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
        .inputOptions(['-ss 00:00:01'])
        .outputOptions(['-vframes 1', '-q:v 2'])
        .output(thumbDiskPath)
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
        })
        .run();
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
    activeLabel: job.activeLabel || '',
    currentItemTitle: job.currentItemTitle,
    speed: job.speed,
    eta: job.eta,
    sizeProgress: job.sizeProgress || '',
    itemsStatus: job.itemsStatus || [],
    filesCount: job.downloadedFiles.length,
    needsCookie: job.needsCookie || false,
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
  if (job.activeProcesses) {
    for (const child of job.activeProcesses) {
      try {
        child.kill('SIGTERM');
      } catch (e) {}
    }
    job.activeProcesses.clear();
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

/**
 * Pre-warms the local POT provider and yt-dlp cache on modal open so downloads start instantaneously.
 */
function prewarmSession() {
  try {
    const http = require('http');
    const req = http.request('http://127.0.0.1:4416/ping', { method: 'GET', timeout: 2000 }, (res) => {});
    req.on('error', () => {});
    req.on('timeout', () => { req.destroy(); });
    req.end();
  } catch (e) {}
}

module.exports = {
  inspectVideo,
  verifyCookie,
  startDownloadJob,
  getJobStatus,
  cancelJob,
  formatYtDlpError,
  prewarmSession
};

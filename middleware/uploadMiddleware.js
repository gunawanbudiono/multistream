const multer = require('multer');
const path = require('path');
const { getUniqueFilename, paths } = require('../utils/storage');

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, paths.videos);
  },
  filename: (req, file, cb) => {
    const uniqueFilename = getUniqueFilename(file.originalname);
    cb(null, uniqueFilename);
  }
});

const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, paths.audio);
  },
  filename: (req, file, cb) => {
    const uniqueFilename = getUniqueFilename(file.originalname);
    cb(null, uniqueFilename);
  }
});

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, paths.avatars);
  },
  filename: (req, file, cb) => {
    const uniqueFilename = getUniqueFilename(file.originalname);
    cb(null, uniqueFilename);
  }
});

const thumbnailStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, paths.thumbnails);
  },
  filename: (req, file, cb) => {
    const uniqueFilename = getUniqueFilename(file.originalname);
    cb(null, uniqueFilename);
  }
});

const universalStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const audioExts = ['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac'];
    if (audioExts.includes(ext) || file.mimetype.startsWith('audio/')) {
      cb(null, paths.audio);
    } else {
      cb(null, paths.videos);
    }
  },
  filename: (req, file, cb) => {
    const uniqueFilename = getUniqueFilename(file.originalname);
    cb(null, uniqueFilename);
  }
});

const videoFilter = (req, file, cb) => {
  const allowedFormats = ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-matroska', 'video/webm'];
  const fileExt = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];
  if (allowedFormats.includes(file.mimetype) || allowedExts.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error('Only .mp4, .avi, .mov, .mkv, and .webm video formats are allowed'), false);
  }
};

const audioFilter = (req, file, cb) => {
  const allowedFormats = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/flac', 'audio/x-flac'];
  const fileExt = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac'];
  if (allowedFormats.includes(file.mimetype) || allowedExts.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error('Only .mp3, .wav, .aac, .m4a, .ogg, and .flac audio formats are allowed'), false);
  }
};

const imageFilter = (req, file, cb) => {
  const allowedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const fileExt = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  if (allowedFormats.includes(file.mimetype) || allowedExts.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error('Only .jpg, .jpeg, .png, .gif, and .webp formats are allowed'), false);
  }
};

const universalFilter = (req, file, cb) => {
  const fileExt = path.extname(file.originalname).toLowerCase();
  const allowedExts = [
    '.mp4', '.avi', '.mov', '.mkv', '.webm',
    '.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac',
    '.jpg', '.jpeg', '.png', '.gif', '.webp'
  ];
  if (
    allowedExts.includes(fileExt) ||
    file.mimetype.startsWith('video/') ||
    file.mimetype.startsWith('audio/') ||
    file.mimetype.startsWith('image/')
  ) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type (${fileExt}). Supported: Video (MP4, AVI, MOV, MKV, WebM), Audio (MP3, M4A, AAC, WAV, FLAC), Image (JPG, PNG, WebP)`), false);
  }
};

const uploadVideo = multer({
  storage: videoStorage,
  fileFilter: videoFilter
});

const uploadAudio = multer({
  storage: audioStorage,
  fileFilter: audioFilter
});

const uploadUniversalMedia = multer({
  storage: universalStorage,
  fileFilter: universalFilter
});

const upload = multer({
  storage: avatarStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB max avatar size
  }
});

const uploadThumbnail = multer({
  storage: thumbnailStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB max thumbnail size
  }
});

module.exports = {
  uploadVideo,
  uploadAudio,
  uploadUniversalMedia,
  upload,
  uploadThumbnail
};
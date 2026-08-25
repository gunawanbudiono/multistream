const path = require('path');
const fs = require('fs-extra');
const ffmpeg = require('fluent-ffmpeg');
const { Video } = require('../models');

async function fixAllThumbnails() {
  const videos = await Video.findAll();
  console.log(`Found ${videos.length} videos to verify thumbnails`);
  
  for (const video of videos) {
    if (!video.filepath || video.filepath.includes('/audio/') || video.filepath.endsWith('.png') || video.filepath.endsWith('.jpg')) {
      continue;
    }
    
    const fullVideoPath = path.join(__dirname, '../public', video.filepath);
    if (!fs.existsSync(fullVideoPath)) {
      console.log(`File not found: ${fullVideoPath}`);
      continue;
    }
    
    await new Promise((resolve) => {
      ffmpeg.ffprobe(fullVideoPath, async (err, metadata) => {
        if (err) {
          console.error(`Probe error on ${video.title}:`, err);
          return resolve();
        }
        
        const videoStream = metadata.streams && metadata.streams.find(s => s.codec_type === 'video');
        if (!videoStream) return resolve();
        
        const width = videoStream.width || 0;
        const height = videoStream.height || 0;
        const resolution = `${width}x${height}`;
        const isPortrait = height > width;
        const thumbSize = isPortrait ? '480x?' : '854x?';
        
        const filename = path.basename(video.filepath);
        const thumbnailFilename = `thumb-${path.parse(filename).name}.jpg`;
        const thumbnailPath = `/uploads/thumbnails/${thumbnailFilename}`;
        const thumbFolder = path.join(__dirname, '../public/uploads/thumbnails');
        fs.ensureDirSync(thumbFolder);
        
        console.log(`Regenerating thumbnail for: "${video.title}" (${resolution}, isPortrait=${isPortrait}) -> size: ${thumbSize}`);
        
        ffmpeg(fullVideoPath)
          .screenshots({
            timestamps: ['10%'],
            filename: thumbnailFilename,
            folder: thumbFolder,
            size: thumbSize
          })
          .on('end', async () => {
            try {
              await Video.update(video.id, {
                thumbnail_path: thumbnailPath,
                resolution: resolution
              });
              console.log(`✓ Updated thumbnail for "${video.title}" successfully!`);
            } catch (dbErr) {
              console.error(`DB error on "${video.title}":`, dbErr);
            }
            resolve();
          })
          .on('error', (err) => {
            console.error(`Thumbnail error on "${video.title}":`, err);
            resolve();
          });
      });
    });
  }
  
  console.log('All thumbnails verified and regenerated successfully!');
  process.exit(0);
}

fixAllThumbnails().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

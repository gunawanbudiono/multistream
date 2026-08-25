const path = require('path');
const fs = require('fs-extra');
const ffmpeg = require('fluent-ffmpeg');
const Video = require('../models/Video');

async function fixImageThumbnails() {
  const allMedia = await Video.findAll();
  console.log(`Checking ${allMedia.length} media items for image thumbnail optimization...`);
  
  for (const item of allMedia) {
    const isImage = item.format === 'png' || item.format === 'jpg' || item.format === 'jpeg' || item.format === 'webp' || (item.filepath && (item.filepath.endsWith('.png') || item.filepath.endsWith('.jpg') || item.filepath.endsWith('.jpeg') || item.filepath.endsWith('.webp')));
    
    if (!isImage) continue;

    const fullOriginalPath = path.join(__dirname, '../public', item.filepath);
    if (!fs.existsSync(fullOriginalPath)) {
      console.log(`Original image missing: ${fullOriginalPath}`);
      continue;
    }

    const filename = path.basename(item.filepath);
    const thumbnailFilename = `thumb-${path.parse(filename).name}.jpg`;
    const thumbnailPath = `/uploads/thumbnails/${thumbnailFilename}`;
    const fullThumbPath = path.join(__dirname, '../public/uploads/thumbnails', thumbnailFilename);
    fs.ensureDirSync(path.dirname(fullThumbPath));

    console.log(`Compressing image thumbnail for: "${item.title}" (${item.format}) -> ${thumbnailFilename}`);

    await new Promise((resolve) => {
      ffmpeg(fullOriginalPath)
        .output(fullThumbPath)
        .size('640x?')
        .outputOptions(['-q:v 3'])
        .on('end', async () => {
          try {
            await Video.update(item.id, {
              thumbnail_path: thumbnailPath
            });
            const sz = fs.statSync(fullThumbPath).size;
            console.log(`✓ Generated optimized thumbnail for "${item.title}" (${Math.round(sz/1024)} KB)`);
          } catch (e) {
            console.error('Update error:', e);
          }
          resolve();
        })
        .on('error', (err) => {
          console.error(`Compress error on ${item.title}:`, err);
          resolve();
        })
        .run();
    });
  }

  console.log('All image thumbnails optimized successfully!');
  process.exit(0);
}

fixImageThumbnails().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

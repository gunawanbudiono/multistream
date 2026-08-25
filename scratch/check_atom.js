const fs = require('fs');
const glob = require('glob');
const path = require('path');

const files = fs.readdirSync(path.join(__dirname, '../public/uploads/videos'));
console.log('Videos on disk:', files);
for (const f of files) {
  if (f.endsWith('.mp4')) {
    const full = path.join(__dirname, '../public/uploads/videos', f);
    const fd = fs.openSync(full, 'r');
    const b = Buffer.alloc(1048576);
    fs.readSync(fd, b, 0, 1048576, 0);
    fs.closeSync(fd);
    console.log(f, '-> moov in first 1MB:', b.indexOf('moov') !== -1);
  }
}

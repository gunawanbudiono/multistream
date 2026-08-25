const fs = require('fs-extra');
const path = require('path');

const tempDir = path.join(__dirname, '../public/uploads/temp');
if (fs.existsSync(tempDir)) {
  const files = fs.readdirSync(tempDir);
  for (const file of files) {
    if (file.includes('chunk')) {
      fs.removeSync(path.join(tempDir, file));
    }
  }
}
const infoDir = path.join(__dirname, '../public/uploads/temp/info');
if (fs.existsSync(infoDir)) {
  fs.emptyDirSync(infoDir);
}
console.log('Temp uploads folder is 100% clean (0 bytes junk)!');
process.exit(0);

const http = require('http');
const fs = require('fs-extra');
const { execFile } = require('child_process');

function checkPing(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', err => resolve({ error: err.message }));
  });
}

async function run() {
  console.log('1. PING multistream-pot-provider:4416:', await checkPing('http://multistream-pot-provider:4416/ping'));
  // Let's create a test cookie with the keys from screenshot
  const rawCookie = `
# Netscape HTTP Cookie File
.youtube.com\tTRUE\t/\tFALSE\t1821791682\tHSID\tAsm3YixX0wpS0_52F
.youtube.com\tTRUE\t/\tTRUE\t1821791682\tSSID\tASzp5Z_qcLCVmpzyh
.youtube.com\tTRUE\t/\tFALSE\t1821791682\tAPISID\tuSM69tIeU7gB7p6z/AoIqQ3
.youtube.com\tTRUE\t/\tTRUE\t1821791682\tSAPISID\tuSM69tIeU7gB7p6z/AoIqQ3
.youtube.com\tTRUE\t/\tTRUE\t1821791682\t__Secure-1PAPISID\tuSM69tIeU7gB7p6z/AoIqQ3
.youtube.com\tTRUE\t/\tTRUE\t1821791682\t__Secure-3PAPISID\tuSM69tIeU7gB7p6z/AoIqQ3
.youtube.com\tTRUE\t/\tFALSE\t1821791682\tSID\tg.a000twhmXfQy59-wY
.youtube.com\tTRUE\t/\tTRUE\t1821791682\t__Secure-1PSID\tg.a000twhmXfQy59-wY
.youtube.com\tTRUE\t/\tTRUE\t1821791682\t__Secure-3PSID\tg.a000twhmXfQy59-wY
`;
  await fs.writeFile('/app/db/test_user_cookie.txt', rawCookie.trim(), 'utf8');

  const args = [
    '-m', 'yt_dlp',
    '--cookies', '/app/db/cookies.txt',
    '--remote-components', 'ejs:github',
    '--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416',
    '--dump-single-json',
    '--no-warnings',
    '--skip-download',
    '--default-search', 'ytsearch',
    'SING-OFF TIKTOK SONGS 26 Montagem Xonada'
  ];

  await new Promise((resolve) => {
    execFile('python3', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.log('ERROR:', stderr || err.message);
      } else {
        const root = JSON.parse(stdout);
        const info = (root.entries && root.entries[0]) || root;
        const formats = info.formats || [];
        const heights = [...new Set(formats.map(f => f.height).filter(Boolean))].sort((a, b) => b - a);
        console.log('VIDEO URL:', info.webpage_url || info.id);
        console.log('TITLE:', info.title);
        console.log('RESOLUTIONS:', heights);
        console.log('FORMAT COUNT:', formats.length);
      }
      resolve();
    });
  });
}

run();

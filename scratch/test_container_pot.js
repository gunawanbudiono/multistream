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

  const testUrls = [
    { title: 'Ngamen 5', url: 'https://www.youtube.com/watch?v=n7X2cbKzh-Q' },
    { title: 'SING-OFF', url: 'https://www.youtube.com/watch?v=5oiuYD5lPIA' }
  ];

  for (const u of testUrls) {
    const args = [
      '-m', 'yt_dlp',
      '--dump-single-json',
      '--no-warnings',
      '--skip-download',
      '--no-playlist',
      '--geo-bypass',
      '--remote-components', 'ejs:github',
      '--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416;youtube:player_client=ios,mweb,web',
      '--cookies', '/app/db/cookies.txt',
      u.url
    ];

    await new Promise((resolve) => {
      execFile('python3', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          console.log(`[${u.title}] ERROR:`, stderr || err.message);
        } else {
          const info = JSON.parse(stdout);
          const formats = info.formats || [];
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
          const resolutionMap = new Map();
          formats.forEach(f => {
            if (f.height && f.vcodec && f.vcodec !== 'none') {
              const h = f.height;
              const fps = f.fps ? `${f.fps}fps` : '';
              const label = labels[h] || `${h}p ${fps}`.trim();
              if (!resolutionMap.has(h)) {
                resolutionMap.set(h, {
                  height: h,
                  label: (f.fps && f.fps > 30) ? `${label} 60fps` : label
                });
              }
            }
          });
          const res = Array.from(resolutionMap.values()).sort((a, b) => b.height - a.height);
          console.log(`[${u.title}] PARSED RESOLUTIONS:`, res.map(r => r.label));
        }
        resolve();
      });
    });
  }
}

run();

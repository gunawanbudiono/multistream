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
    { title: 'SING-OFF', url: 'https://www.youtube.com/watch?v=5oiuYD5lPIA' },
    { title: 'Rick Astley', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
  ];

  const configs = [
    { name: '1. No cookies, POT only', args: ['--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416'] },
    { name: '2. Cookies only, no POT', args: ['--cookies', '/app/db/cookies.txt'] },
    { name: '3. Cookies + POT', args: ['--cookies', '/app/db/cookies.txt', '--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416'] },
    { name: '4. Cookies + POT + player_client=tv_embedded,web', args: ['--cookies', '/app/db/cookies.txt', '--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416;youtube:player_client=tv_embedded,web'] },
    { name: '5. Cookies + POT + player_client=android,web', args: ['--cookies', '/app/db/cookies.txt', '--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416;youtube:player_client=android,web'] }
  ];

  for (const u of testUrls) {
    console.log(`\n================= ${u.title} =================`);
    for (const cfg of configs) {
      const args = [
        '-m', 'yt_dlp',
        '--dump-single-json',
        '--no-warnings',
        '--skip-download',
        '--remote-components', 'ejs:github',
        ...cfg.args,
        u.url
      ];

      await new Promise((resolve) => {
        execFile('python3', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (err) {
            console.log(`[${cfg.name}] -> ERROR:`, stderr.split('\n')[0] || err.message);
          } else {
            try {
              const info = JSON.parse(stdout);
              const heights = [...new Set((info.formats || []).filter(f => f.vcodec && f.vcodec !== 'none').map(f => f.height).filter(Boolean))].sort((a, b) => b - a);
              console.log(`[${cfg.name}] -> RAW HEIGHTS:`, heights);
            } catch (e) {
              console.log(`[${cfg.name}] -> JSON PARSE ERR`);
            }
          }
          resolve();
        });
      });
    }
  }
}

run();

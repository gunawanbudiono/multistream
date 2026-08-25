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

  const testArgsList = [
    { name: 'No player_client arg', args: ['--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416'] },
    { name: 'player_client=android_vr,web', args: ['--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416;youtube:player_client=android_vr,web'] },
    { name: 'player_client=web_creator,tv', args: ['--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416;youtube:player_client=web_creator,tv'] },
    { name: 'player_client=android,mweb', args: ['--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416;youtube:player_client=android,mweb'] },
    { name: 'player_skip=ios', args: ['--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416;youtube:player_skip=ios'] }
  ];

  for (const t of testArgsList) {
    const args = [
      '-m', 'yt_dlp',
      '--cookies', '/app/db/cookies.txt',
      '--remote-components', 'ejs:github',
      ...t.args,
      '--dump-single-json',
      '--no-warnings',
      '--skip-download',
      'https://www.youtube.com/watch?v=5oiuYD5lPIA'
    ];

    await new Promise((resolve) => {
      execFile('python3', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          console.log(`[${t.name}] ERROR:`, stderr.slice(0, 100) || err.message);
        } else {
          try {
            const info = JSON.parse(stdout);
            const heights = [...new Set((info.formats || []).map(f => f.height).filter(Boolean))].sort((a, b) => b - a);
            console.log(`[${t.name}] RESOLUTIONS:`, heights);
          } catch (e) {
            console.log(`[${t.name}] PARSE ERR`);
          }
        }
        resolve();
      });
    });
  }
}

run();

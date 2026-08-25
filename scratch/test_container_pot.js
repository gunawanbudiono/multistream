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

  const tests = [
    { name: 'android without POT', args: ['--extractor-args', 'youtube:player_client=android'] },
    { name: 'web without POT', args: ['--extractor-args', 'youtube:player_client=web'] },
    { name: 'android with POT', args: ['--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416;youtube:player_client=android'] },
    { name: 'web with POT and cookies', args: ['--cookies', '/app/db/cookies.txt', '--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416'] }
  ];

  for (const t of tests) {
    const args = [
      '-m', 'yt_dlp',
      '-F',
      '--remote-components', 'ejs:github',
      ...t.args,
      'https://www.youtube.com/watch?v=LXb3EKWsInQ'
    ];

    await new Promise((resolve) => {
      execFile('python3', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        console.log(`=== TEST: ${t.name} ===`);
        if (err) {
          console.log('ERROR:', stderr.slice(0, 100) || err.message);
        } else {
          const lines = stdout.split('\n').filter(l => l.includes('mp4') || l.includes('webm') || l.includes('m4a'));
          console.log(lines.slice(0, 8).join('\n'));
        }
        resolve();
      });
    });
  }
}

run();

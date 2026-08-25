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
    '-v',
    '--cookies', '/app/db/test_user_cookie.txt',
    '--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416;youtube:player_client=tv,mweb,web',
    '--dump-single-json',
    '--no-warnings',
    '--skip-download',
    'https://www.youtube.com/watch?v=n7X2cbKzh-Q'
  ];

  await new Promise((resolve) => {
    execFile('python3', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.log('3. YT-DLP ERROR:', stderr || err.message);
      } else {
        try {
          const info = JSON.parse(stdout);
          console.log('3. YT-DLP SUCCESS! Title:', info.title);
        } catch (e) {
          console.log('3. YT-DLP PARSE ERR:', stdout.slice(0, 200));
        }
      }
      resolve();
    });
  });
}

run();

const http = require('http');
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
  console.log('2. PING 172.18.0.1:4416:', await checkPing('http://172.18.0.1:4416/ping'));

  const args = [
    '-c', 'import urllib.request, http.cookiejar; cj = http.cookiejar.MozillaCookieJar("/app/db/cookies.txt"); opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj)); req = urllib.request.Request("https://www.youtube.com", headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"}); opener.open(req); cj.save(ignore_discard=True, ignore_expires=True); print("SAVED COOKIES COUNT:", len(cj))'
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

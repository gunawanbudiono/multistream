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
    '-c', 'import yt_dlp_plugins.extractor, os; path = os.path.join(yt_dlp_plugins.extractor.__path__[0], "getpot_bgutil_http.py"); print("".join(open(path).readlines()[140:200]))'
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

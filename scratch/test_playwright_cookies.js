const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');
const { execFile } = require('child_process');

function cookiesToNetscape(cookies) {
  let lines = [
    '# Netscape HTTP Cookie File',
    '# http://curl.haxx.se/rfc/cookie_spec.html',
    '# This is a generated file!  Do not edit.',
    ''
  ];

  for (const c of cookies) {
    const domain = c.domain.startsWith('.') ? c.domain : '.' + c.domain;
    const includeSubdomains = 'TRUE';
    const path = c.path || '/';
    const isSecure = c.secure ? 'TRUE' : 'FALSE';
    const expires = c.expires && c.expires > 0 ? Math.round(c.expires) : Math.round(Date.now() / 1000) + 86400 * 365;
    const name = c.name;
    const value = c.value;
    lines.push(`${domain}\t${includeSubdomains}\t${path}\t${isSecure}\t${expires}\t${name}\t${value}`);
  }

  return lines.join('\n') + '\n';
}

async function run() {
  console.log('1. LAUNCHING PLAYWRIGHT CHROMIUM...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta'
  });

  const page = await context.newPage();
  console.log('2. NAVIGATING TO YOUTUBE TARGET VIDEO...');
  await page.goto('https://www.youtube.com/watch?v=n7X2cbKzh-Q', { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('3. WAITING FOR PLAYER INITIALIZATION...');
  await page.waitForTimeout(3000);

  const cookies = await context.cookies();
  console.log(`4. EXTRACTED ${cookies.length} COOKIES:`, cookies.map(c => c.name));

  const netscapeContent = cookiesToNetscape(cookies);
  const cookiePath = '/app/db/cookies.txt';
  await fs.writeFile(cookiePath, netscapeContent, 'utf8');
  console.log('5. SAVED COOKIES TO', cookiePath);

  await browser.close();
  console.log('6. CHROMIUM CLOSED.');

  console.log('7. TESTING YT-DLP ON MUSIC VIDEO WITH EXTRACTED COOKIES...');
  const args = [
    '-m', 'yt_dlp',
    '--cookies', cookiePath,
    '--extractor-args', 'youtubepot-bgutilhttp:base_url=http://multistream-pot-provider:4416',
    '--dump-single-json',
    '--no-warnings',
    '--skip-download',
    'https://www.youtube.com/watch?v=n7X2cbKzh-Q'
  ];

  execFile('python3', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      console.log('   -> YT-DLP ERROR:', stderr || err.message);
    } else {
      try {
        const info = JSON.parse(stdout);
        console.log('   -> 🎉 SUCCESS! Title:', info.title);
        console.log('   -> Duration:', info.duration, 'seconds');
        console.log('   -> Formats found:', info.formats?.length);
      } catch (e) {
        console.log('   -> PARSE ERR:', stdout.slice(0, 200));
      }
    }
  });
}

run().catch(console.error);

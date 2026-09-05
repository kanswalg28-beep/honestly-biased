// scripts/submit-indexnow.js - Submit all site URLs to IndexNow (Bing, Yahoo, Yandex, Seznam)
// Documentation: https://www.indexnow.org/documentation

const https = require('https');

const HOST = 'www.honestlybiased.com';
const KEY = 'c748291b40d347c69a083fbb2241deef';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const SITEMAP_URL = `https://${HOST}/sitemap.xml`;

async function fetchSitemapUrls() {
  return new Promise((resolve, reject) => {
    https.get(SITEMAP_URL, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const matches = [...data.matchAll(/<loc>(https:\/\/[^<]+)<\/loc>/g)];
        const urls = matches.map(m => m[1]);
        resolve(urls);
      });
    }).on('error', reject);
  });
}

function submitToIndexNow(urls) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: KEY_LOCATION,
      urlList: urls
    });

    const options = {
      hostname: 'api.indexnow.org',
      port: 443,
      path: '/indexnow',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body });
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log(`?? Fetching sitemap URLs from ${SITEMAP_URL}...`);
  try {
    const urls = await fetchSitemapUrls();
    console.log(`Found ${urls.length} URLs to submit.`);

    if (urls.length === 0) {
      console.warn('No URLs found in sitemap.');
      return;
    }

    console.log(`?? Submitting ${urls.length} URLs to IndexNow API (Bing / Yandex / Seznam)...`);
    const result = await submitToIndexNow(urls);

    console.log(`HTTP Response: ${result.statusCode}`);
    if (result.statusCode === 200 || result.statusCode === 202) {
      console.log('? IndexNow submission successful! URLs submitted for immediate crawling.');
    } else {
      console.warn('?? IndexNow response message:', result.body || '(no body)');
    }
  } catch (err) {
    console.error('? Error during IndexNow submission:', err.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = { submitToIndexNow, fetchSitemapUrls };

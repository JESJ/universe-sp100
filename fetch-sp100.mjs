import fs from 'fs';
import https from 'https';
import { spawnSync } from 'node:child_process';

const SRC_URL = process.env.SOURCE_URL;   // e.g. your Google Sheet “Publish as CSV” URL
if (!SRC_URL) { console.error('Missing SOURCE_URL'); process.exit(1); }

function httpGet(u) {
  return new Promise((res, rej) => {
    https.get(u, r => {
      let d=''; r.on('data', c => d+=c); r.on('end', ()=> res({ status:r.statusCode, body:d }));
    }).on('error', rej);
  });
}

function normalize(t) {
  if (!t) return null;
  let s = String(t).trim().toUpperCase();
  s = s.replace(/^BRK\.B$/, 'BRK/B').replace(/^BF\.B$/, 'BF/B');
  s = s.replace(/[^A-Z0-9/.-]/g,'');
  return s || null;
}

function parseList(text) {
  // try JSON first
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) return j.map(normalize).filter(Boolean);
    if (Array.isArray(j.tickers)) return j.tickers.map(normalize).filter(Boolean);
  } catch {}
  // CSV fallback: use column named Symbol/Ticker or first column
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const head = lines[0].split(',').map(s=>s.trim().toLowerCase());
  const idx = head.indexOf('symbol') >= 0 ? head.indexOf('symbol')
            : head.indexOf('ticker') >= 0 ? head.indexOf('ticker') : 0;
  const out = [];
  for (let i=1;i<lines.length;i++) {
    const cols = lines[i].split(',');
    out.push(normalize(cols[idx]));
  }
  return out.filter(Boolean);
}

const res = await httpGet(SRC_URL);
if (res.status < 200 || res.status >= 300) {
  console.error('Fetch failed', res.status);
  process.exit(1);
}

const list = Array.from(new Set(parseList(res.body))).filter(Boolean).sort();
if (!list.length) { console.error('Empty list after parsing'); process.exit(1); }

const newJson = JSON.stringify(list, null, 2);
const oldJson = fs.existsSync('sp100.json') ? fs.readFileSync('sp100.json','utf8') : '';

if (newJson !== oldJson) {
  fs.writeFileSync('sp100.json', newJson);
  spawnSync('git', ['config','user.name','bot'], { stdio:'inherit' });
  spawnSync('git', ['config','user.email','bot@local'], { stdio:'inherit' });
  spawnSync('git', ['add','sp100.json'], { stdio:'inherit' });
  spawnSync('git', ['commit','-m','chore: update sp100.json'], { stdio:'inherit' });
  console.log('sp100.json updated');
} else {
  console.log('No change');
}

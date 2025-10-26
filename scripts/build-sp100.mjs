// scripts/build-sp100.js
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import cheerio from 'cheerio';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'sp100.json');

const WIKI_HTML =
  'https://en.wikipedia.org/api/rest_v1/page/html/S%26P_100';

function norm(sym) {
  if (!sym) return null;
  let s = sym.trim().toUpperCase();
  // Normalize common wiki/formatting quirks
  s = s.replace(/\u00A0/g, '');       // non-breaking space
  s = s.replace(/[^A-Z0-9\.\-]/g, ''); // strip weird chars, keep . and -
  // Keep both GOOG & GOOGL if present. Keep BRK.B as-is.
  return s || null;
}

async function fetchFromWikipedia() {
  const { data: html } = await axios.get(WIKI_HTML, {
    headers: { 'User-Agent': 'sp100-pages/1.0 (GitHub Action)' },
    timeout: 20000
  });
  const $ = cheerio.load(html);

  // Find the table that has a header cell containing "Symbol"
  const tables = $('table');
  let symbols = [];
  tables.each((_, t) => {
    const hdrs = $(t).find('thead th, tr th').map((i, th) => $(th).text().trim()).get();
    const hasSymbol = hdrs.some(h => /symbol/i.test(h));
    const looksLikeConstituents = hdrs.length >= 2 && hasSymbol;
    if (!looksLikeConstituents) return;

    // Find the "Symbol" column index
    const idx = hdrs.findIndex(h => /symbol/i.test(h));
    if (idx === -1) return;

    // Collect that column from tbody rows
    $(t).find('tbody tr').each((i, tr) => {
      const tds = $(tr).find('td');
      if (!tds || tds.length <= idx) return;
      // symbols sometimes are links; prefer link text
      let raw = $(tds[idx]).text().trim();
      const linkTxt = $(tds[idx]).find('a').first().text().trim();
      if (linkTxt && linkTxt.length >= 1 && linkTxt.length <= 6) raw = linkTxt;
      const s = norm(raw);
      if (s) symbols.push(s);
    });
  });

  // Clean up & unique
  symbols = symbols.filter(Boolean);
  symbols = Array.from(new Set(symbols));

  // Basic sanity: if we got way too few, treat as failure
  if (symbols.length < 80) {
    throw new Error(`Wikipedia parse returned only ${symbols.length} symbols`);
  }

  // Optional tiny allowlist to ensure usual suspects are present
  const mustHave = ['AAPL','MSFT','NVDA','AMZN','GOOGL','META','BRK.B','JPM','V','XOM'];
  const missing = mustHave.filter(m => !symbols.includes(m));
  if (missing.length >= 3) {
    console.warn('[WARN] Many must-have symbols missing:', missing.join(', '));
  }

  return symbols.sort();
}

function readExisting() {
  try {
    const txt = fs.readFileSync(OUT, 'utf8');
    const arr = JSON.parse(txt);
    if (Array.isArray(arr) && arr.length) return arr;
  } catch {}
  return null;
}

function writeOut(symbols) {
  fs.writeFileSync(OUT, JSON.stringify(symbols, null, 0) + '\n', 'utf8');
  console.log(`[OK] wrote ${symbols.length} symbols to ${OUT}`);
}

(async () => {
  try {
    const syms = await fetchFromWikipedia();
    writeOut(syms);
  } catch (e) {
    console.error('[ERROR] scrape failed:', e.message || e);
    const prev = readExisting();
    if (prev) {
      console.log('[FALLBACK] keeping previous sp100.json (', prev.length, 'symbols )');
      writeOut(prev); // rewrite so Pages still deploys (timestamp change)
    } else {
      // very first run and scrape failed: seed with a minimal universe to not break deploys
      const seed = ["AAPL","MSFT","NVDA","AMZN","GOOGL","GOOG","META","TSLA","SPY","QQQ","IWM"];
      writeOut(seed);
      process.exitCode = 1; // mark failure but still emit a file
    }
  }
})();

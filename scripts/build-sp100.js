// scripts/build-sp100.js
// Node >=18. Fetch S&P 100 symbols from Wikipedia and write public/sp100.json

import fs from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import pRetry from 'p-retry';

// Make failures loud
process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION:', err?.stack || err);
  process.exit(1);
});
process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION:', err?.stack || err);
  process.exit(1);
});

const WIKI_URL = 'https://en.wikipedia.org/wiki/S%26P_100';
const OUT_PATH = path.resolve('public/sp100.json');

function cleanSymbol(raw) {
  if (!raw) return null;
  let s = String(raw).trim().toUpperCase().replace(/\[\d+\]/g, '');
  s = s.replace(/\u00A0/g, '');            // non-breaking space
  s = s.replace(/[^\w.\-]/g, '');          // keep A-Z0-9 . -
  return s || null;
}

async function fetchSP100() {
  const { data: html } = await axios.get(WIKI_URL, { timeout: 20000 });
  const $ = cheerio.load(html);
  const symbols = [];

  $('table.wikitable').each((_, tbl) => {
    const headers = $(tbl).find('th').map((__, th) => $(th).text().trim().toLowerCase()).get();
    if (headers.some(h => h.includes('symbol'))) {
      $(tbl).find('tbody tr').each((__, tr) => {
        const tds = $(tr).find('td');
        if (!tds.length) return;
        const symRaw = $(tds[0]).text() || $(tr).find('a[href*="/wiki/"]').first().text();
        const sym = cleanSymbol(symRaw);
        if (sym) symbols.push(sym);
      });
    }
  });

  const uniq = Array.from(new Set(symbols))
    .filter(s => /^[A-Z0-9.\-]{1,10}$/.test(s))
    .sort();

  if (uniq.length < 80) {
    throw new Error(`Only found ${uniq.length} symbols; wiki layout likely changed.`);
  }
  return uniq;
}

async function buildOnce() {
  console.log('[build-sp100] fetching…');
  const list = await fetchSP100();

  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('No tickers produced');
  }
  if (!list.every(s => typeof s === 'string')) {
    throw new Error('Tickers must be strings');
  }

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(list, null, 2));
  console.log(`[build-sp100] wrote ${list.length} symbols → ${OUT_PATH}`);
}

await pRetry(buildOnce, {
  retries: 3,
  factor: 2,
  minTimeout: 1000,
  maxTimeout: 5000,
  onFailedAttempt: e => {
    console.warn(`[build-sp100] attempt ${e.attemptNumber} failed (${e.retriesLeft} left): ${e.message}`);
  }
});

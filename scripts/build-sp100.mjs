// scripts/build-sp100.js
// Node >=18. Fetch S&P 100 symbols from Wikipedia and write public/sp100.json

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

const WIKI_URL = 'https://en.wikipedia.org/wiki/S%26P_100';
const OUT_PATH = path.resolve('public/sp100.json');

function cleanSymbol(raw) {
  if (!raw) return null;
  // Strip footnote markers and whitespace
  let s = String(raw).trim().toUpperCase().replace(/\[\d+\]/g, '');
  // Common weirdness fixes (rare):
  s = s.replace(/\u00A0/g, ''); // NBSP
  s = s.replace(/[^\w\.\-]/g, ''); // keep letters/digits/dot/dash
  // Wikipedia sometimes shows class A/B as BRK.B — keep the dot form (Schwab accepts BRK.B).
  return s || null;
}

async function fetchSP100() {
  const { data: html } = await axios.get(WIKI_URL, { timeout: 20000 });
  const $ = cheerio.load(html);

  // Find the constituents table by looking for a header that includes "Symbol"
  const tables = $('table.wikitable');
  let symbols = [];
  tables.each((_, tbl) => {
    const headers = $(tbl).find('th').map((_, th) => $(th).text().trim().toLowerCase()).get();
    if (headers.some(h => h.includes('symbol'))) {
      $(tbl)
        .find('tbody tr')
        .each((__, tr) => {
          const tds = $(tr).find('td');
          if (!tds.length) return;
          const symRaw =
            $(tds[0]).text() || // many pages: first col is symbol
            $(tr).find('a[href*="/wiki/"]').first().text();
          const sym = cleanSymbol(symRaw);
          if (sym) symbols.push(sym);
        });
    }
  });

  // Deduplicate & sanity filter
  const uniq = Array.from(new Set(symbols)).filter(s =>
    /^[A-Z0-9.\-]{1,10}$/.test(s)
  );

  // The list is ~100; keep it stable and sorted
  uniq.sort();

  if (uniq.length < 80) {
    throw new Error(`Only found ${uniq.length} symbols — Wikipedia layout likely changed.`);
  }

  return uniq;
}

async function main() {
  try {
    const symbols = await fetchSP100();
    fs.writeFileSync(OUT_PATH, JSON.stringify(symbols, null, 2));
    console.log(`Wrote ${symbols.length} symbols → ${OUT_PATH}`);
  } catch (err) {
    console.error('Failed to build sp100.json:', err.message || err);
    process.exit(1);
  }
}

main();

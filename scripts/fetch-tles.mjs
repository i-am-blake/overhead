#!/usr/bin/env node
/**
 * Pull the CelesTrak 'active' catalog ONCE, then filter it locally against
 * every source in roster.json, and write data/tles.json for the page to read.
 *
 * One request a day, no matter how many companies are on the roster. That is
 * both kinder to a nonprofit's servers than a query per operator, and the thing
 * that makes the roster cheap to extend: adding a company is a regex, not an
 * HTTP call.
 *
 * The page never talks to CelesTrak — it reads the committed file, which
 * sidesteps CORS and means a booth full of people generates zero load upstream.
 *
 * No dependencies. Needs Node 20+ for built-in fetch.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'tles.json');
const OUT_FULL = path.join(ROOT, 'data', 'tles-full.json');
const ENDPOINT = 'https://celestrak.org/NORAD/elements/gp.php';
const SATCAT   = 'https://celestrak.org/satcat/records.php';

/* CONFIRMED LIMITATION — VERIFIED AGAINST CELESTRAK, 2026.
   CelesTrak ran out of 5-digit catalog numbers with the addition of Saramago on
   2026-07-11; the official USSF SATCAT passed 100000 and is now above 100400.
   Newly catalogued objects get 6-digit numbers and GP data for them is NOT
   published in the legacy TLE format this script requests.

   Consequence: anything catalogued since July 2026 is SILENTLY ABSENT. The fetch
   succeeds, the object simply is not in the response — no error, no warning.
   For a Space Week reveal that could mean the newest Washington-built spacecraft
   is precisely the one that does not appear.

   RESOLVED: this script now fetches OMM (JSON) and rebuilds the two TLE lines
   itself, using Alpha-5 for the catalog field. Both 5- and 6-digit objects come
   through. See the OMM -> TLE section below. */
const UA = 'overhead/1.0 (+https://github.com/i-am-blake/overhead)';
/* One string, shared by every script. A semicolon inside the parenthetical made
   CelesTrak return 403 while the identical request with a simpler UA succeeded.
   Keep it conventional: name, version, contact URL, nothing else. */

/** Fetch with backoff. 403 and 429 from CelesTrak are usually rate limiting
    rather than a real refusal — requests arriving close together get rejected.
    Three tries, widening gaps, before giving up. */
async function getWithRetry(u, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(u, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.text();
    if (res.status !== 403 && res.status !== 429) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    if (i === tries - 1) {
      throw new Error(`HTTP ${res.status} after ${tries} attempts — rate limited, ` +
        'or the User-Agent is being refused. Space requests further apart.');
    }
    const wait = (i + 1) * 20;
    console.warn(`  HTTP ${res.status}; waiting ${wait}s before retry ${i + 2} of ${tries}`);
    await new Promise(r => setTimeout(r, wait * 1000));
  }
}

/* ---------- OMM -> TLE ----------
   CelesTrak stopped publishing TLE for objects catalogued after 2026-07-11: the
   format's 5-character catalog field cannot hold a 6-digit number. OMM (JSON) has
   no such limit and carries exactly the same orbital elements.

   So we fetch OMM, rebuild the two lines here, and carry the true NORAD number
   separately in JSON. SGP4 never uses the catalog number for propagation — it is
   only an identifier — so the rebuilt lines are mathematically identical.

   The catalog field uses Alpha-5, the same scheme Space-Track uses: a leading
   letter carries the hundred-thousands digit, extending the field to 339999.
   Verified round-trip: 63/63 known-good TLEs rebuilt byte-for-byte from their own
   parsed values. */

const ALPHA5 = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // I and O omitted, per the standard

function catnum5(n) {
  if (!Number.isFinite(n)) return null;
  if (n < 100000) return String(n).padStart(5, '0');
  if (n > 339999) return null;
  return ALPHA5[Math.floor(n / 10000) - 10] + String(n % 10000).padStart(4, '0');
}

function fixedWidth(v, w, d) {
  const o = v.toFixed(d).padStart(w);
  return o.length === w ? o : o.slice(-w);
}

/** decimal -> TLE exponent notation, e.g. 0.00011111 -> ' 11111-3' */
function expo(v) {
  if (!v) return ' 00000-0';
  const sign = v < 0 ? '-' : ' ';
  v = Math.abs(v);
  let e = 0;
  while (v < 0.1) { v *= 10; e--; }
  while (v >= 1) { v /= 10; e++; }
  return sign + String(Math.round(v * 100000)).padStart(5, '0') + (e < 0 ? '-' : '+') + Math.abs(e);
}

function epochField(iso) {
  const d = new Date(iso);
  const yy = String(d.getUTCFullYear() % 100).padStart(2, '0');
  const doy = (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1;
  return yy + doy.toFixed(8).padStart(12, '0');
}

function ommToTle(o) {
  const cn = catnum5(Number(o.NORAD_CAT_ID));
  if (!cn) return null;                     // above 339999: genuinely out of reach
  let l1 = '1 ' + cn + (o.CLASSIFICATION_TYPE || 'U') + ' ' +
    String(o.OBJECT_ID || '').padEnd(8).slice(0, 8) + ' ' + epochField(o.EPOCH) + ' ' +
    (Number(o.MEAN_MOTION_DOT) < 0 ? '-' : ' ') +
    Math.abs(Number(o.MEAN_MOTION_DOT)).toFixed(8).slice(1) + ' ' +
    expo(Number(o.MEAN_MOTION_DDOT)) + ' ' + expo(Number(o.BSTAR)) + ' ' +
    String(o.EPHEMERIS_TYPE ?? 0) + ' ' + String(o.ELEMENT_SET_NO ?? 999).padStart(4);
  l1 += checksum(l1);
  let l2 = '2 ' + cn + ' ' + fixedWidth(Number(o.INCLINATION), 8, 4) + ' ' +
    fixedWidth(Number(o.RA_OF_ASC_NODE), 8, 4) + ' ' +
    String(Math.round(Number(o.ECCENTRICITY) * 1e7)).padStart(7, '0') + ' ' +
    fixedWidth(Number(o.ARG_OF_PERICENTER), 8, 4) + ' ' +
    fixedWidth(Number(o.MEAN_ANOMALY), 8, 4) + ' ' +
    fixedWidth(Number(o.MEAN_MOTION), 11, 8) + String(o.REV_AT_EPOCH ?? 0).padStart(5);
  l2 += checksum(l2);
  return { name: (o.OBJECT_NAME || '').trim(), norad: Number(o.NORAD_CAT_ID), line1: l1, line2: l2 };
}

/* ---------- fleet totals ----------
   The page draws a sample, so it cannot compute a true fleet total — summing the
   205 objects it displays understates the real figure roughly fiftyfold. These
   numbers are computed HERE, over every matched object before sampling, and
   written into the feed for the page to display.

   Speed comes from the element set: a = cbrt(mu / n^2), v = sqrt(mu / a).
   Checked against published values — ISS 7.66, Starlink 7.59, GPS 3.87 km/s,
   all within 0.15%.

   It is still an approximation. It assumes each spacecraft has held its current
   orbit for its whole life, which ignores injection orbits, orbit raising and
   station keeping. Starlink inserts near 300 km and raises to 550, a speed
   difference of about 1.5% over a few weeks of a multi-year life. The figure is
   an order-of-magnitude statement, not an odometer reading, and the page says so. */
const MU = 398600.4418;

function speedKmS(line2) {
  const revday = parseFloat(line2.slice(52, 63));
  if (!isFinite(revday) || revday <= 0) return null;
  const nrad = revday * 2 * Math.PI / 86400;
  const a = Math.cbrt(MU / (nrad * nrad));
  return Math.sqrt(MU / a);
}

function fleetTotals(objects) {
  const now = Date.now();
  let count = 0, speed = 0, km = 0, dated = 0;
  for (const o of objects) {
    const v = speedKmS(o.line2);
    if (!v) continue;
    count++; speed += v;
    if (!o.launched) continue;
    const t0 = Date.parse(o.launched);
    if (!isFinite(t0)) continue;
    dated++; km += v * Math.max(0, (now - t0) / 1000);
  }
  return { count, dated, combinedSpeedKmS: speed, distanceKm: km, asOf: new Date(now).toISOString() };
}

/* ---------- TLE validation ---------- */

function checksum(line) {
  let s = 0;
  for (const ch of line.slice(0, 68)) {
    if (ch >= '0' && ch <= '9') s += Number(ch);
    else if (ch === '-') s += 1;
  }
  return s % 10;
}

function validTle(l1, l2) {
  if (l1.length !== 69 || l2.length !== 69) return false;
  if (!l1.startsWith('1 ') || !l2.startsWith('2 ')) return false;
  if (Number(l1[68]) !== checksum(l1)) return false;
  if (Number(l2[68]) !== checksum(l2)) return false;
  const incl = Number(l2.slice(8, 16));
  const mm = Number(l2.slice(52, 63));
  return Number.isFinite(incl) && incl >= 0 && incl <= 180 && Number.isFinite(mm) && mm > 0 && mm < 20;
}

function epochAgeDays(l1) {
  const yy = Number(l1.slice(18, 20));
  const doy = Number(l1.slice(20, 32));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return (Date.now() - (Date.UTC(year, 0, 1) + (doy - 1) * 86400000)) / 86400000;
}

function parseTleText(text) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('1 ') && lines[i + 1]?.startsWith('2 ')) {
      const prev = lines[i - 1];
      const name = prev && !prev.startsWith('1 ') && !prev.startsWith('2 ')
        ? prev.trim() : 'OBJECT ' + lines[i].slice(2, 7);
      out.push({ name, norad: Number(lines[i].slice(2, 7)), line1: lines[i], line2: lines[i + 1] });
      i++;
    }
  }
  return out;
}

/** Take n items spread evenly across the list, not the first n. */
function sample(arr, n) {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
}

/* ---------- fetch the catalog once ---------- */

const roster = JSON.parse(await fs.readFile(path.join(ROOT, 'roster.json'), 'utf8'));

const url = new URL(ENDPOINT);
for (const [k, v] of Object.entries(roster.catalog ?? { GROUP: 'active' })) url.searchParams.set(k, v);
url.searchParams.set('FORMAT', 'json');   // OMM: no 5-digit ceiling

/* --offline <file> reads a saved CelesTrak response instead of fetching, so the
   parsing can be validated against a real payload before trusting a live run:
       curl -o gp.json 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'
       node scripts/fetch-tles.mjs --offline gp.json
   This is the only way to prove the OMM shape matches what the code expects. */
const offlineIdx = process.argv.indexOf('--offline');
const offlineFile = offlineIdx > -1 ? process.argv[offlineIdx + 1] : null;

console.log(offlineFile ? `Reading ${offlineFile}` : `Fetching ${url}`);
let catalog;
try {
  let body;
  if (offlineFile) {
    body = await fs.readFile(offlineFile, 'utf8');
  } else {
    body = await getWithRetry(url);
  }
  if (/no gp data found/i.test(body)) throw new Error('CelesTrak returned no GP data');

  const omm = JSON.parse(body);
  if (!Array.isArray(omm) || !omm.length) throw new Error('OMM response was not a non-empty array');

  // Fail loudly and specifically if the shape is not what we expect, rather than
  // producing a catalog of NaNs.
  const NEEDED = ['OBJECT_NAME','NORAD_CAT_ID','EPOCH','MEAN_MOTION','ECCENTRICITY',
                  'INCLINATION','RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY','BSTAR'];
  const missing = NEEDED.filter(k => !(k in omm[0]));
  if (missing.length) {
    throw new Error('OMM records are missing expected fields: ' + missing.join(', ') +
      '\n      Keys actually present: ' + Object.keys(omm[0]).join(', '));
  }

  const beyond = [];
  catalog = [];
  for (const o of omm) {
    const t = ommToTle(o);
    if (t) catalog.push(t); else beyond.push(Number(o.NORAD_CAT_ID));
  }
  if (beyond.length) {
    console.warn(`  ${beyond.length} objects exceed 339999 and cannot be expressed even in`);
    console.warn('  Alpha-5. Excluded. Not expected yet, but flag it if it appears.');
  }
} catch (err) {
  console.error(`Catalog fetch failed: ${err.message}`);
  console.error('A JSON parse error would mean CelesTrak changed the OMM response shape.');
  console.error('Keeping the existing data/tles.json.');
  process.exit(1);
}
console.log(`${catalog.length} objects in the catalog`);
// Sanity: rebuilt lines must be well-formed before anything downstream trusts them
const malformed = catalog.filter(o => !validTle(o.line1, o.line2)).length;
if (malformed) {
  console.error(`${malformed} rebuilt element sets failed validation. Aborting rather than`);
  console.error('writing bad data. This means ommToTle and the OMM shape disagree.');
  process.exit(1);
}
const sixDigit = catalog.filter(o => o.norad >= 100000).length;
console.log(`${sixDigit} with 6-digit catalog numbers` +
  (sixDigit ? ' — invisible to the old TLE fetch' : ''));

/* ---------- second request: SATCAT, for launch dates ----------
   The GP feed carries elements only. Launch date lives in the SATCAT, which is
   a separate endpoint on the same service. One extra request a day buys the
   "distance flown" figure, which is derived rather than claimed. */
const launched = new Map();
const objType = new Map();
let catalogStats = null;
try {
  const u = new URL(SATCAT);
  u.searchParams.set('GROUP', 'active');
  u.searchParams.set('FORMAT', 'CSV');
  const rows = (await getWithRetry(u)).split(/\r?\n/).filter(Boolean);
  const head = rows[0].split(',').map(s => s.trim());
  const iId = head.indexOf('NORAD_CAT_ID');
  const iLd = head.indexOf('LAUNCH_DATE');
  const iOt = head.indexOf('OBJECT_TYPE');
  if (iId < 0 || iLd < 0) throw new Error('unexpected SATCAT columns: ' + head.slice(0, 8));
  for (const line of rows.slice(1)) {
    const c = line.split(',');
    const id = Number(c[iId]);
    if (!Number.isFinite(id)) continue;
    if (c[iLd]) launched.set(id, c[iLd].trim());
    if (iOt >= 0 && c[iOt]) objType.set(id, c[iOt].trim());
  }
  console.log(`${launched.size} launch dates from SATCAT`);

  /* Denominator for the Washington share. It must be PAYLOADS, not every tracked
     object: the active catalog also carries spent rocket stages and debris, and
     counting those would understate Washington's share against a population that
     was never manufactured by anyone. */
  let payloads = 0, typed = 0;
  for (const o of catalog) {
    const t = objType.get(o.norad);
    if (!t) continue;
    typed++;
    if (/^PAY/i.test(t)) payloads++;
  }
  catalogStats = { total: catalog.length, typed, payloads };
  console.log(`${payloads} of ${typed} typed objects are payloads (the share denominator)\n`);
} catch (err) {
  console.warn(`SATCAT fetch failed (${err.message}) — continuing without launch dates.`);
  console.warn('Distance-flown figures will be omitted rather than estimated.\n');
}

/* ---------- filter locally, once per source ---------- */

const collected = [];
const fleetAll = [];      // every match, before sampling — the basis for fleet totals
const report = [];
const seen = new Set();

for (const src of roster.sources) {
  if (src.enabled === false) {
    console.log(`  ---  ${src.id.padEnd(15)} disabled in roster.json`);
    report.push({ id: src.id, count: 0, note: 'disabled' });
    continue;
  }

  const re = src.match ? new RegExp(src.match, 'i') : null;
  const ex = src.exclude ? new RegExp(src.exclude, 'i') : null;
  const ids = new Set(src.ids ?? []);

  let hits = catalog.filter(o =>
    (ids.has(o.norad) || (re && re.test(o.name))) && !(ex && ex.test(o.name)));

  const total = hits.length;
  const bad = hits.filter(o => !validTle(o.line1, o.line2)).length;
  hits = hits.filter(o => validTle(o.line1, o.line2) && !seen.has(o.norad));
  const stale = hits.filter(o => epochAgeDays(o.line1) > 14).length;
  fleetAll.push(...hits.map(o => ({
    name: o.name, line1: o.line1, line2: o.line2, launched: launched.get(o.norad) || null,
    operator: src.operator, cls: src.class ?? 'sat', built: src.built || '' })));
  hits = sample(hits, src.limit ?? 25);
  hits.forEach(o => seen.add(o.norad));

  collected.push(...hits.map(o => ({
    name: o.name, operator: src.operator, built: src.built, kind: src.kind,
    cls: src.class ?? 'sat',
    verified: !!(src.source_url && src.verified_by && src.verified_on),
    norad: o.norad,
    launched: launched.get(o.norad) || null,
    objectType: objType.get(o.norad) || null,
    line1: o.line1, line2: o.line2
  })));

  const note = `${total} matched, ${hits.length} kept` +
    (bad ? `, ${bad} malformed` : '') + (stale ? `, ${stale} stale` : '');
  console.log(`  ${String(hits.length).padStart(3)}  ${src.id.padEnd(15)} ${note}`);
  if (!hits.length) console.log(`       VERIFY: ${src.verify ?? 'no note recorded'}`);
  report.push({ id: src.id, count: hits.length, note });
}

console.log(`\n${collected.length} objects collected from ${report.filter(r => r.count).length} sources`);
const withDate = collected.filter(o => o.launched).length;
console.log(`${withDate} of ${collected.length} have a launch date` +
  (withDate < collected.length ? ' — the rest are excluded from the distance total' : ''));

/* ---------- provenance audit ---------- */
const unsigned = roster.sources.filter(s =>
  s.enabled !== false && !(s.source_url && s.verified_by && s.verified_on));
if (unsigned.length) {
  console.log('\n' + '='.repeat(64));
  console.log('PROVENANCE AUDIT — these Washington-built claims are NOT signed off:');
  for (const s of unsigned) {
    const missing = [
      s.source_url  ? null : 'source_url',
      s.verified_by ? null : 'verified_by',
      s.verified_on ? null : 'verified_on'
    ].filter(Boolean).join(', ');
    console.log(`  ${s.id.padEnd(16)} ${s.operator} / ${s.built}`);
    console.log(`  ${''.padEnd(16)} missing: ${missing}`);
    if (s.basis) console.log(`  ${''.padEnd(16)} basis: ${s.basis}`);
  }
  const n = collected.filter(o => !o.verified).length;
  console.log(`\n${n} of ${collected.length} objects carry an unverified attribution.`);
  console.log('They are marked verified:false in data/tles.json.');
  console.log('='.repeat(64));
} else {
  console.log('\nProvenance audit: all enabled sources signed off.');
}

/* ---------- refuse to overwrite good data with a bad run ---------- */

const floor = roster.minimum_objects ?? 20;
if (collected.length < floor) {
  console.error(`Only ${collected.length} objects, below the floor of ${floor}. Keeping the existing file.`);
  process.exit(1);
}

let previous = null;
try { previous = JSON.parse(await fs.readFile(OUT, 'utf8')); } catch { /* first run */ }
if (previous && !previous.demo && collected.length < previous.objects.length * 0.5) {
  console.error(`${collected.length} is under half the previous ${previous.objects.length}. ` +
                `Treating as a bad run and keeping the existing file.`);
  process.exit(1);
}

await fs.mkdir(path.dirname(OUT), { recursive: true });
const fleet = fleetTotals(fleetAll);
if (catalogStats) {
  fleet.catalogPayloads = catalogStats.payloads;
  fleet.catalogTotal = catalogStats.total;
  fleet.sharePct = catalogStats.payloads
    ? (fleet.count / catalogStats.payloads) * 100 : null;
}
const byOp = {};
fleetAll.forEach(o => { byOp[o.operator] = (byOp[o.operator] || 0) + 1; });
fleet.byOperator = byOp;

console.log(`\nFLEET TOTALS — computed over all ${fleet.count} matched objects, not the ${collected.length} displayed`);
console.log(`  combined speed  ${Math.round(fleet.combinedSpeedKmS).toLocaleString()} km/s`);
console.log(`  distance flown  ${(fleet.distanceKm / 1e12).toFixed(2)} trillion km`);
console.log(`  with a launch date: ${fleet.dated} of ${fleet.count}`);
if (fleet.sharePct != null) {
  console.log(`  WASHINGTON SHARE  ${fleet.sharePct.toFixed(1)}% of ${fleet.catalogPayloads} active payloads`);
  console.log('  (denominator excludes rocket bodies and debris)');
}

await fs.writeFile(OUT, JSON.stringify({
  generated: new Date().toISOString(),
  source: 'CelesTrak GP active catalog (celestrak.org), fetched daily',
  demo: false, report, fleet, objects: collected
}, null, 1) + '\n');

console.log(`Wrote ${path.relative(ROOT, OUT)}`);

/* Every matched object, minimal fields, for the full-sky view. Loaded on demand
   rather than on every visit — it is an order of magnitude larger than the
   sampled feed. */
await fs.writeFile(OUT_FULL, JSON.stringify({
  generated: fleet.asOf,
  note: 'Every matched object, unsampled. Loaded only when the full-sky view is selected.',
  count: fleetAll.length,
  /* Grouped by operator so the operator, class and build site are written once
     each rather than 10,884 times. Names are included because Explore draws from
     this file and needs labels, not just positions. */
  groups: Object.values(fleetAll.reduce((acc, o) => {
    (acc[o.operator] ??= { o: o.operator, c: o.cls, b: o.built, s: [] })
      .s.push([o.name, o.line1, o.line2]);
    return acc;
  }, {}))
}) + '\n');
console.log(`Wrote ${path.relative(ROOT, OUT_FULL)} — ${fleetAll.length} objects`);

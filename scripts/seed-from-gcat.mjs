#!/usr/bin/env node
/**
 * Seed the roster from GCAT.
 *
 * GCAT (J. McDowell, planet4589.org/space/gcat) records manufacture at the level
 * of the operating location — the factory — rather than the headquarters parent
 * company. That is the exact distinction this project needs: HQ-level data says
 * BlackSky is Virginia; factory-level data says the satellites were built in
 * Tukwila.
 *
 * This is NOT part of the daily refresh. It runs by hand, occasionally, and it
 * does not touch roster.json. It writes a CANDIDATE list for a human to review
 * and fold in, because every "Washington-built" claim still needs a signature
 * from Space Northwest.
 *
 *   node scripts/seed-from-gcat.mjs           # -> data/gcat-washington.json
 *   node scripts/seed-from-gcat.mjs --print   # also dump a readable summary
 *
 * GCAT is CC-BY. Any use must cite: data from GCAT (J. McDowell,
 * planet4589.org/space/gcat)
 *
 * NOTE: this has not been run against the live files. Column names are resolved
 * from the header rather than assumed, and the script fails loudly with the
 * headers it actually found if it cannot locate what it needs.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'gcat-washington.json');
const UA = 'overhead/1.0 (+https://github.com/i-am-blake/overhead)';

const BASE = 'https://planet4589.org/space/gcat/tsv';
const FILES = {
  orgs:    `${BASE}/tables/orgs.tsv`,
  objects: `${BASE}/cat/satcat.tsv`
};

/* Washington State bounding box. Filtering on coordinates rather than on a text
   match for ", WA" catches organizations whose location string is formatted
   differently, and is harder to fool. Text match is kept as a cross-check. */
const WA = { latMin: 45.50, latMax: 49.01, lonMin: -124.90, lonMax: -116.90 };

/* ---------- TSV helpers ---------- */

async function grab(url) {
  process.stdout.write(`  fetching ${url.split('/').slice(-2).join('/')} … `);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  console.log(`${(text.length / 1e6).toFixed(1)} MB`);
  return text;
}

/** GCAT headers begin with '#'. Returns {cols, rows}. */
function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.length && !/^#\s*$/.test(l));
  const headerLine = lines.find(l => l.startsWith('#'));
  if (!headerLine) throw new Error('no header line found');
  const cols = headerLine.replace(/^#/, '').split('\t').map(s => s.trim());
  const rows = [];
  for (const l of lines) {
    if (l.startsWith('#')) continue;
    const c = l.split('\t');
    if (c.length < 2) continue;
    rows.push(c.map(s => s.trim()));
  }
  return { cols, rows };
}

/** Find a column by any of several candidate names; throw with context if absent. */
function col(cols, names, label) {
  for (const n of names) {
    const i = cols.findIndex(c => c.toLowerCase() === n.toLowerCase());
    if (i >= 0) return i;
  }
  throw new Error(
    `could not find a column for ${label} (tried ${names.join(', ')}).\n` +
    `      Columns present: ${cols.slice(0, 24).join(', ')}${cols.length > 24 ? ' …' : ''}\n` +
    `      GCAT column definitions: https://planet4589.org/space/gcat/web/cat/cols.html`);
}

/* ---------- 1. Washington organizations ---------- */

console.log('GCAT roster seeding — data from GCAT (J. McDowell, planet4589.org/space/gcat)\n');

let orgsTsv, objTsv;
try {
  orgsTsv = await grab(FILES.orgs);
  objTsv  = await grab(FILES.objects);
} catch (err) {
  console.error(`\nFetch failed: ${err.message}`);
  console.error('GCAT may have moved or renamed these files. Check the catalog index:');
  console.error('  https://planet4589.org/space/gcat/web/cat/index.html');
  process.exit(1);
}

const orgs = parseTsv(orgsTsv);
const oCode = col(orgs.cols, ['Code', 'UCode'], 'organization code');
const oName = col(orgs.cols, ['Name', 'ShortName', 'EName'], 'organization name');
const oLoc  = col(orgs.cols, ['Location'], 'organization location');
const oLat  = col(orgs.cols, ['Latitude', 'Lat'], 'latitude');
const oLon  = col(orgs.cols, ['Longitude', 'Lon'], 'longitude');

const waOrgs = new Map();
for (const r of orgs.rows) {
  const lat = parseFloat(r[oLat]), lon = parseFloat(r[oLon]);
  const loc = r[oLoc] || '';
  const inBox = Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= WA.latMin && lat <= WA.latMax && lon >= WA.lonMin && lon <= WA.lonMax;
  const byText = /,\s*WA\b|Washington/i.test(loc);
  if (!inBox && !byText) continue;
  waOrgs.set(r[oCode], {
    code: r[oCode], name: r[oName], location: loc,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    matchedBy: inBox && byText ? 'coordinates + text' : (inBox ? 'coordinates' : 'text only')
  });
}

console.log(`\n${waOrgs.size} organizations with a Washington operating location:`);
for (const o of waOrgs.values()) {
  console.log(`  ${(o.code || '?').padEnd(12)} ${(o.name || '').slice(0, 40).padEnd(42)} ${o.location}  [${o.matchedBy}]`);
}
if (!waOrgs.size) {
  console.error('\nNo Washington organizations matched. Either the bounding box is wrong or the');
  console.error('location/coordinate columns are not what this script expects. Inspect orgs.tsv.');
  process.exit(1);
}

/* ---------- 2. objects built by them ----------
   satcat.tsv carries Satcat (the NORAD number), Name, LDate, Owner, Manufacturer,
   Bus and Motor. Manufacturer is the build claim; Motor is the propulsion
   supplier, which is how Washington-built thrusters on otherwise non-WA
   spacecraft become visible. */

const obj = parseTsv(objTsv);
const sCat  = col(obj.cols, ['Satcat'], 'NORAD catalog number');
const sName = col(obj.cols, ['Name'], 'object name');
const sLd   = col(obj.cols, ['LDate', 'LaunchDate'], 'launch date');
const sMfr  = col(obj.cols, ['Manufacturer'], 'manufacturer');
const sType = obj.cols.findIndex(c => /^type$/i.test(c));
const sBus  = obj.cols.findIndex(c => /^bus$/i.test(c));
const sMotor= obj.cols.findIndex(c => /^motor$/i.test(c));
const sOwner= obj.cols.findIndex(c => /^owner$/i.test(c));

const byOrg = new Map();
let resolved = 0, motorOnly = 0;

for (const r of obj.rows) {
  const mfrRaw = (r[sMfr] || '').trim();
  const motorRaw = sMotor >= 0 ? (r[sMotor] || '').trim() : '';

  // GCAT can give compound values like "LEOS/SSL"; test each part
  const parts = s => s.split(/[\/,+]/).map(x => x.trim()).filter(Boolean);
  const mfrHit = parts(mfrRaw).find(x => waOrgs.has(x));
  const motorHit = parts(motorRaw).find(x => waOrgs.has(x));
  if (!mfrHit && !motorHit) continue;

  const org = waOrgs.get(mfrHit || motorHit);
  const norad = parseInt(r[sCat], 10);
  const rec = {
    norad: Number.isFinite(norad) ? norad : null,
    name: r[sName],
    launched: r[sLd],
    type: sType >= 0 ? r[sType] : null,
    bus: sBus >= 0 ? r[sBus] : null,
    owner: sOwner >= 0 ? r[sOwner] : null,
    // 'built' means the bus came from here; 'propulsion' means only the motor did
    role: mfrHit ? 'built' : 'propulsion'
  };
  if (!mfrHit) motorOnly++;
  const key = org.code;
  if (!byOrg.has(key)) byOrg.set(key, { org, objects: [] });
  byOrg.get(key).objects.push(rec);
  resolved++;
}

console.log(`${resolved} objects attributed to a Washington organization`);
console.log(`  ${resolved - motorOnly} by manufacturer, ${motorOnly} by propulsion only\n`);

const summary = [...byOrg.values()].sort((a, b) => b.objects.length - a.objects.length);
for (const g of summary) {
  const withId = g.objects.filter(o => o.norad).length;
  const built = g.objects.filter(o => o.role === 'built').length;
  console.log(`  ${String(g.objects.length).padStart(5)}  ${(g.org.name || g.org.code).slice(0, 38).padEnd(40)} ${g.org.location}`);
  console.log(`  ${''.padStart(5)}  ${withId} with a NORAD id, ${built} built here, ${g.objects.length - built} propulsion only`);
}

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify({
  generated: new Date().toISOString(),
  source: 'GCAT (J. McDowell, planet4589.org/space/gcat), CC-BY',
  note: 'CANDIDATES ONLY. Every entry needs verification and a signature in roster.json before it appears on the page.',
  filter: WA,
  organizations: [...waOrgs.values()],
  manufacturers: summary
}, null, 1) + '\n');

console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
console.log('These are candidates, not roster entries. Review, then add to roster.json with');
console.log('basis, source_url, verified_by and verified_on filled in.');

if (process.argv.includes('--print')) {
  for (const g of summary) {
    console.log(`\n--- ${g.org.name} (${g.org.location}) ---`);
    for (const o of g.objects.slice(0, 40)) {
      console.log(`  ${String(o.norad ?? '—').padStart(7)}  ${(o.name || '').padEnd(28)} ${o.launched || ''}`);
    }
    if (g.objects.length > 40) console.log(`  … and ${g.objects.length - 40} more`);
  }
}

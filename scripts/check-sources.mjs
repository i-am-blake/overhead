#!/usr/bin/env node
/**
 * Preflight: can this machine reach every data source the project needs?
 *
 *   node scripts/check-sources.mjs
 *
 * No proxy is required. The fetch runs server-side — from a laptop or a GitHub
 * Actions runner — so CORS does not apply, and CelesTrak's gp.php and
 * records.php are public API endpoints intended to be called programmatically.
 * (robots.txt discourages crawlers; it is not an access control, and neither
 * curl nor Node's fetch consults it.)
 *
 * If something here fails, the message tells you which of the three causes it is:
 * no internet, a corporate proxy in the way, or the source itself changing.
 */

const UA = 'overhead/1.0 (+https://github.com/i-am-blake/overhead)';

const SOURCES = [
  { name: 'CelesTrak GP (OMM/JSON)',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json',
    expect: 'JSON array of OMM records',
    check: t => { const j = JSON.parse(t); return Array.isArray(j) && j.length
      ? `${j.length} objects, first is ${j[0].OBJECT_NAME} (NORAD ${j[0].NORAD_CAT_ID})`
      : 'parsed but empty'; } },
  { name: 'CelesTrak SATCAT (CSV)',
    url: 'https://celestrak.org/satcat/records.php?GROUP=active&FORMAT=CSV',
    expect: 'CSV with NORAD_CAT_ID and LAUNCH_DATE',
    check: t => { const h = t.split(/\r?\n/)[0].split(',').map(s => s.trim());
      const need = ['NORAD_CAT_ID','LAUNCH_DATE','OBJECT_TYPE'].filter(k => !h.includes(k));
      return need.length ? `MISSING COLUMNS: ${need.join(', ')}` : `${h.length} columns, all expected fields present`; } },
  { name: 'GCAT organizations',
    url: 'https://planet4589.org/space/gcat/tsv/tables/orgs.tsv',
    expect: 'TSV with Location, Latitude, Longitude',
    check: t => { const h = t.split('\n')[0].replace(/^#/,'').split('\t').map(s => s.trim());
      const need = ['Code','Name','Location','Latitude','Longitude'].filter(k => !h.includes(k));
      return need.length ? `MISSING COLUMNS: ${need.join(', ')}` : `${h.length} columns, all expected fields present`; } },
  { name: 'GCAT satellite catalog',
    url: 'https://planet4589.org/space/gcat/tsv/cat/satcat.tsv',
    expect: 'TSV with Satcat and Manufacturer',
    check: t => { const h = t.split('\n')[0].replace(/^#/,'').split('\t').map(s => s.trim());
      const need = ['Satcat','Name','Manufacturer'].filter(k => !h.includes(k));
      return need.length ? `MISSING COLUMNS: ${need.join(', ')}` : `${h.length} columns, all expected fields present`; } }
];

console.log('Preflight — checking every source this project depends on.\n');

let failures = 0;
for (const s of SOURCES) {
  process.stdout.write(`  ${s.name.padEnd(28)}`);
  const t0 = Date.now();
  try {
    const res = await fetch(s.url, { headers: { 'User-Agent': UA } });
    const ms = Date.now() - t0;
    if (!res.ok) { console.log(`HTTP ${res.status}  (${ms}ms)`); failures++; continue; }
    const body = await res.text();
    let detail;
    try { detail = s.check(body); } catch (e) { detail = `unreadable: ${e.message}`; }
    const bad = /MISSING|unreadable|empty/.test(detail);
    if (bad) failures++;
    console.log(`${bad ? 'SCHEMA CHANGED' : 'ok'}  ${(body.length/1e6).toFixed(1)}MB  ${ms}ms`);
    console.log(`  ${''.padEnd(28)}${detail}`);
  } catch (err) {
    failures++;
    console.log(`FAILED  ${err.message}`);
    console.log(`  ${''.padEnd(28)}expected: ${s.expect}`);
  }
}

console.log();
if (!failures) {
  console.log('All sources reachable and shaped as expected. Run:');
  console.log('  node scripts/fetch-tles.mjs');
  process.exit(0);
}

console.log(`${failures} of ${SOURCES.length} sources failed. Which is it?\n`);
console.log('  Nothing reachable at all');
console.log('    -> no internet, or a corporate proxy is intercepting. Node\'s built-in');
console.log('       fetch ignores HTTP_PROXY, but curl does not. Work around it with:');
console.log('         curl -o gp.json "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json"');
console.log('         node scripts/fetch-tles.mjs --offline gp.json');
console.log('       Or run it from GitHub Actions, whose runners have open egress.\n');
console.log('  403 or 429 from CelesTrak');
console.log('    -> rate limiting. This project makes two requests a day; if you are');
console.log('       seeing this, something is looping. Wait, then retry.\n');
console.log('  "SCHEMA CHANGED"');
console.log('    -> the source is reachable but its columns moved. The field names are');
console.log('       printed above; update the column lookups in the fetch or seed script.\n');
process.exit(1);

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
    url: 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json',
    expect: 'JSON array of OMM records',
    check: t => { const j = JSON.parse(t); if (!Array.isArray(j) || !j.length) return 'parsed but empty';
      const need = ['OBJECT_NAME','NORAD_CAT_ID','EPOCH','MEAN_MOTION','ECCENTRICITY','INCLINATION',
                    'RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY','BSTAR'].filter(k => !(k in j[0]));
      return need.length ? `MISSING FIELDS: ${need.join(', ')}`
        : `sample object ${j[0].OBJECT_NAME}, all OMM fields present`; } },
  { name: 'CelesTrak SATCAT (CSV)',
    url: 'https://celestrak.org/satcat/records.php?CATNR=25544&FORMAT=CSV',
    expect: 'CSV with NORAD_CAT_ID and LAUNCH_DATE',
    check: t => { const h = t.split(/\r?\n/)[0].split(',').map(s => s.trim());
      const need = ['NORAD_CAT_ID','LAUNCH_DATE','OBJECT_TYPE'].filter(k => !h.includes(k));
      return need.length ? `MISSING COLUMNS: ${need.join(', ')}` : `${h.length} columns, all expected fields present`; } },
  { name: 'GCAT organizations',
    url: 'https://planet4589.org/space/gcat/tsv/tables/orgs.tsv',
    rangeBytes: 4000,
    expect: 'TSV with Location, Latitude, Longitude',
    check: t => { const h = t.split('\n')[0].replace(/^#/,'').split('\t').map(s => s.trim());
      const need = ['Code','Name','Location','Latitude','Longitude'].filter(k => !h.includes(k));
      return need.length ? `MISSING COLUMNS: ${need.join(', ')}` : `${h.length} columns, all expected fields present`; } },
  { name: 'GCAT satellite catalog',
    url: 'https://planet4589.org/space/gcat/tsv/cat/satcat.tsv',
    rangeBytes: 4000,
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
    const headers = { 'User-Agent': UA, 'Accept': '*/*' };
    if (s.rangeBytes) headers['Range'] = `bytes=0-${s.rangeBytes}`;
    const res = await fetch(s.url, { headers, redirect: 'follow' });
    const ms = Date.now() - t0;
    if (!res.ok && res.status !== 206) { console.log(`HTTP ${res.status}  (${ms}ms)`); failures++; continue; }
    const body = await res.text();
    let detail;
    try { detail = s.check(body); } catch (e) { detail = `unreadable: ${e.message}`; }
    const bad = /MISSING|unreadable|empty/.test(detail);
    if (bad) failures++;
    console.log(`${bad ? 'SCHEMA CHANGED' : 'ok'}  ${(body.length/1e6).toFixed(1)}MB  ${ms}ms`);
    console.log(`  ${''.padEnd(28)}${detail}`);
  } catch (err) {
    failures++;
    // 'fetch failed' is a wrapper; the cause underneath names the real problem
    const cause = err.cause ? ` <- ${err.cause.code || ''} ${err.cause.message || ''}`.trim() : '';
    console.log(`FAILED  ${err.message}${cause}`);
    console.log(`  ${''.padEnd(28)}expected: ${s.expect}`);

    // Control: retry with a plain browser UA. If this succeeds, our UA is the
    // problem. If it fails the same way, the address is being blocked.
    try {
      const alt = await fetch(s.url, { headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
                      '(KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        'Accept': 'application/json,text/plain,*/*'
      }});
      console.log(`  ${''.padEnd(28)}control with a browser User-Agent: HTTP ${alt.status}` +
        (alt.ok ? '  <-- OUR USER-AGENT IS BEING REFUSED' : '  <-- blocked regardless of User-Agent'));
    } catch (e2) {
      const c2 = e2.cause ? ` (${e2.cause.code || e2.cause.message})` : '';
      console.log(`  ${''.padEnd(28)}control also failed${c2}  <-- network level, not User-Agent`);
    }
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

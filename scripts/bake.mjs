#!/usr/bin/env node
/**
 * Bake the current data/tles.json into index.html, producing one self-contained
 * file with real orbits inside it.
 *
 * Why this exists: the hosted page reads data/tles.json at runtime, which is
 * right for a website. But a booth is a different problem — one laptop, maybe
 * no wifi, and a file you want to be able to hand to someone on a USB stick.
 * The baked file needs no server, no network, and no feed.
 *
 *   node scripts/fetch-tles.mjs      # get real elements
 *   node scripts/bake.mjs            # inline them
 *   open dist/overhead-standalone.html
 *
 * Re-bake before the event. Elements go stale.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'index.html');
const FEED = path.join(ROOT, 'data', 'tles.json');
const OUT = path.join(ROOT, 'dist', 'overhead-standalone.html');

const feed = JSON.parse(await fs.readFile(FEED, 'utf8'));
if (!Array.isArray(feed.objects) || !feed.objects.length) {
  console.error('data/tles.json has no objects. Run scripts/fetch-tles.mjs first.');
  process.exit(1);
}
if (feed.demo) {
  console.warn('WARNING: the feed is still the placeholder set. Baking invented orbits.');
  console.warn('         Run scripts/fetch-tles.mjs first if you want real ones.\n');
}

let html = await fs.readFile(SRC, 'utf8');

const start = html.indexOf('const DEMO_TLES = ');
if (start < 0) { console.error('Could not find the DEMO_TLES declaration.'); process.exit(1); }
const end = html.indexOf('];', start);
if (end < 0) { console.error('Could not find the end of DEMO_TLES.'); process.exit(1); }

const slim = feed.objects.map(o => ({
  name: o.name, operator: o.operator, built: o.built,
  kind: o.kind, line1: o.line1, line2: o.line2
}));

html = html.slice(0, start)
     + 'const DEMO_TLES = ' + JSON.stringify(slim)
     + html.slice(end + 1);

// The bundled set is now the real one, so the page shouldn't call it invented.
if (!feed.demo) {
  html = html.replace(
    "': '<span class=\"dot\"></span>Sample orbits — real physics, invented satellites';",
    "': '<span class=\"dot live\"></span>Real orbits — " + slim.length +
    " tracked, baked in " + new Date(feed.generated).toISOString().slice(0, 10) + "';");
}

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`Baked ${slim.length} objects into ${path.relative(ROOT, OUT)} (${kb} KB)`);
console.log(`Elements dated ${feed.generated}`);
console.log('Open it straight off disk — no server needed.');

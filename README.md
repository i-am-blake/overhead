# Overhead

Everything above you right now that was built in Washington. A single static page for
Seattle Space Week, Sep 28 – Oct 4 2026.

Positions come from SGP4 propagation of two-line element sets — the same model ground
stations use. Visibility checks whether the sun is more than 6° below your horizon *and*
whether the spacecraft is still catching sunlight, which is the difference between
"overhead" and "you can actually see it."

## Cost

Nothing, if you keep the repository public.

| | |
|---|---|
| Orbital data | CelesTrak, a nonprofit that publishes it freely |
| Refresh job | GitHub Actions — free on public repos |
| Hosting | GitHub Pages — free on public repos, HTTPS included |
| Propagation | satellite.js, MIT, via cdnjs |
| Domain | `you.github.io/overhead` is free. A real name is $10–15/yr — see below |

## How it fits together

```
 GitHub Actions (daily, 09:17 UTC)
        │
        │  scripts/fetch-tles.mjs reads roster.json,
        │  queries CelesTrak, validates, commits
        ▼
 data/tles.json  ──────►  index.html
   (in the repo)          reads it same-origin
```

The page never calls CelesTrak. That is the whole trick — it removes the CORS problem,
removes the need for a proxy or a serverless function, and means a booth full of people
generates exactly zero load on a nonprofit's servers. It also means the site keeps working
if CelesTrak is down; you just show yesterday's elements, which for orbital mechanics is
fine.

## Deploy

1. Create a **public** repo and push these files to `main`.
2. **Settings → Pages → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. **Settings → Actions → General → Workflow permissions**: *Read and write*. The refresh
   job commits back to the repo, so it needs this.
4. **Actions → Refresh orbital elements → Run workflow.** Read the log. It prints a line
   per source with how many objects it kept.
5. Reload the page. The status line under the heading should turn green and say how old
   the elements are.

Until step 4 succeeds, the page runs on placeholder elements and says so in the status
line — constructed from published shell altitudes and inclinations, so the geometry
behaves correctly but the pass times are not real.

### About the domain

`you.github.io/overhead` works and costs nothing, but reads as a side project. The better
move costs you nothing too: ask Space Northwest for a subdomain off `spacenorthwest.org`.
It is one DNS CNAME on their side, it makes this an official Space Week thing, and it gets
you a name people will actually type.

## Getting real orbits

The page ships with placeholder elements so it runs anywhere. Three ways to real ones,
fastest first.

**No terminal.** Open the page, click *Switch to real orbits*, and use one of the CelesTrak
links in the panel. Select all, paste, done — operator and build site are filled in from
the object names. Good for a quick look; it does not persist.

**The proper way.** Run the refresh job, either from the Actions tab or locally:

```sh
node scripts/fetch-tles.mjs
```

**Validate the parsing first.** The script has never met a live CelesTrak response —
everything so far was tested against synthetic payloads. Before trusting a live run, save
one and feed it in offline:

```sh
curl -o gp.json 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'
node scripts/fetch-tles.mjs --offline gp.json
```

If the OMM field names differ from what the code expects, it aborts and prints the keys
that were actually present. It also refuses to write if any rebuilt element set fails
validation, or if the object count is below the floor — so a bad run leaves the previous
good data in place.

That writes `data/tles.json`, which the page reads on load. Commit it, and the daily cron
keeps it current from then on.

**For a booth with bad wifi.** Bake the elements into a single file:

```sh
node scripts/fetch-tles.mjs
node scripts/bake.mjs          # -> dist/overhead-standalone.html
```

No server, no network, no feed. Opens straight off disk and works on a laptop in airplane
mode. Re-bake shortly before the event — TLEs are good for days, not months, and pass
times drift by minutes once the elements are a few weeks old.

## The attribution gap

The page ends with a statement of the problem rather than a feature: tracking catalogs and
launch registries record where a spacecraft is and who is liable for it, never who built
it. There is no such field anywhere in the system, which is why `roster.json` has to be
curated by hand and why `scripts/seed-from-gcat.mjs` exists at all.

This deliberately has no submit button. A form implies a moderation queue and a promise
that submissions appear on the map; neither is committed to. If Space Northwest later
wants to collect submissions, the useful field to ask for is the NORAD catalog number —
it is the only key that joins a claim to an object the page can actually draw.

## Editing the spacecraft list

Everything editorial lives in `roster.json`. Nothing else hard-codes a spacecraft.

```json
{
  "id": "blacksky",
  "query": { "NAME": "BLACKSKY" },
  "match": "BLACKSKY",
  "operator": "BlackSky",
  "built": "Seattle, WA",
  "limit": 20
}
```

The script fetches the CelesTrak `active` catalog **once**, then filters it locally
against every source. Adding a company costs no extra HTTP request — one fetch a day
covers the whole roster however long it gets, which is both kinder to a nonprofit's
servers than a query per operator and what makes the list cheap to extend.

`match` is a regex against the object name. `ids` takes explicit NORAD numbers, for craft
whose names give nothing away. `exclude` drops false positives. `enabled: false` parks a
source you haven't verified yet. When a source matches more than `limit`, the script
samples evenly across the results rather than taking the first N — otherwise you get forty
Starlinks from one orbital plane and a very boring sky dome.

**Why this can't be fully automatic.** No catalog has a "built in Washington" field.
CelesTrak knows names, IDs and orbits; it does not know who welded the bus. The hardest
cases are spacecraft flying under someone else's name — LeoStella in Tukwila built Loft
Orbital's YAM satellites, and no pattern match on "LeoStella" will ever find them. Those
need explicit NORAD IDs, which means someone has to look them up. Every `verify` note in
the roster is a task, not a decoration.

**Read this before the page goes public.** The `built` field is a claim about where
someone else's spacecraft was manufactured. Some are clear, some are arguable, and this
is a room full of people who would know. Have someone at Space Northwest read the list.

## Safety rails in the refresh job

- Element sets are checked for line length, checksum, and physically sane inclination and
  mean motion before being written.
- The run aborts rather than committing if it collects fewer than `minimum_objects`, or
  fewer than half of what the previous run collected. A partial CelesTrak outage leaves
  yesterday's data in place instead of blanking the page.
- Sources that return nothing print the `expect` note from `roster.json`, so a silent
  catalog rename looks different from a network failure.
- One request per source per day, spaced two seconds apart, with a User-Agent identifying
  the project. Be a good guest.

## Known rough edges

- **Scheduled workflows switch off after 60 days of repository inactivity.** If this sits
  idle between events, push a commit or hit *Run workflow* before you need it.
- Passes that are still in progress when the 14-hour look-ahead window ends are dropped.
- The `xplore` and `kuiper` sources may return nothing depending on what the catalog
  actually calls those objects. The log will tell you; verify before assuming it broke.
- No service worker, so the page needs a connection on first load. Fine for a booth,
  worth adding if you want it to survive bad conference wifi.
- The observer is a single fixed point — `OBSERVER` near the top of the script. Space Week
  spans Federal Way to Redmond, but that is 43 km at the widest, worth 1–5° of peak
  elevation and about six seconds of timing. A venue picker would have implied a precision
  that isn't there. If you deploy this somewhere genuinely elsewhere, change the three
  values rather than adding a selector.

## Local development

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Opening `index.html` straight off disk will not work —
the browser blocks reading `data/tles.json` over `file://`, and the page will fall back to
its bundled elements and tell you why.

To test the fetch job locally:

```sh
node scripts/fetch-tles.mjs
```

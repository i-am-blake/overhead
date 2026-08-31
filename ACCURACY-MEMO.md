# Accuracy memo — what Space Northwest needs to confirm

Everything below is a claim the tracker makes on screen that only Space Northwest can
stand behind. Nothing here can be resolved by code. Until a row is signed off, the page
displays a visible "attributions pending Space Northwest sign-off" caveat.

Fill `basis`, `source_url`, `verified_by`, `verified_on` in `roster.json`. The refresh
job prints an audit of what is still missing on every run.

## VERIFICATION LOG — checked against live sources

Everything below was confirmed against the actual endpoints, not assumed.

| claim | status |
|---|---|
| SATCAT CSV has `NORAD_CAT_ID`, `LAUNCH_DATE`, `OBJECT_TYPE` | **confirmed** |
| SATCAT CSV supports 9-digit catalog numbers | **confirmed** — CSV yes, legacy text no |
| GCAT `orgs.tsv` has Code / Name / Location / Latitude / Longitude | **confirmed** |
| GCAT `satcat.tsv` has Manufacturer, Bus, Motor, Owner | **confirmed** |
| GCAT `psatcat.tsv` has Manufacturer | **FALSE — it does not.** Seed script fixed |
| 5-digit catalog numbers exhausted | **confirmed** — 2026-07-11, SATCAT now above 100400 |
| TLE format cannot carry the new numbers | **confirmed** — those objects are silently absent |
| GCAT cannot reach subsystem contractors | **FALSE** — `Motor` field links propulsion |
| Aerojet Rocketdyne/Redmond is in GCAT | **confirmed** — 47.67N, 122.12W |
| Amazon's GCAT location | **Seattle**, not Kirkland — roster disagrees |

### Three things that were broken

1. **The seed script could never have worked.** It read `Manufacturer` from
   `psatcat.tsv`, which has no such column — GCAT keeps Manufacturer, Bus and Motor in
   `satcat.tsv`. Fixed, and simplified from a three-file join to two.

2. **The TLE format gap is real and current.** CelesTrak ran out of 5-digit catalog
   numbers on 2026-07-11 and the official SATCAT is now past 100400. Objects catalogued
   since then are not published in TLE format at all. The fetch does not fail — the
   objects are simply absent. The script now warns when the highest number it sees is
   near the ceiling, but the actual fix is moving to `FORMAT=json` (OMM). **This is the
   single highest-risk item before the reveal.**

3. **Propulsion is reachable after all.** I previously wrote that GCAT covers only prime
   contractors. It has a `Motor` field, and Aerojet Rocketdyne/Redmond is a GCAT
   organization in Washington. Washington-built thrusters flying on non-Washington
   spacecraft are therefore discoverable. The seed script now reports them separately as
   `role: propulsion`. Whether to count them is an editorial decision with a big effect:
   including them would make the Washington footprint dramatically larger, and the claim
   dramatically broader.

### Available and unused

`DECAY_DATE` and `OPS_STATUS_CODE` are both in the SATCAT CSV. The page asserts counts
reflect "spacecraft currently operational in orbit" — those two fields would let it
verify that rather than assert it. Worth wiring before the claim goes on a screen.

## 0. Start here: seed the roster from GCAT

```sh
node scripts/seed-from-gcat.mjs --print
```

GCAT (J. McDowell, planet4589.org/space/gcat) is the best available source for this
project, for a specific reason: it records manufacture at the level of the **operating
location** — the factory — rather than the headquarters parent company. HQ-level data
says BlackSky is Virginia. Factory-level data says the satellites were built in Tukwila.
GCAT is built around that distinction instead of losing it.

It is also current (Release 1.8.1, data updated July 2026) where the UCS database is
frozen at May 2023, and it is CC-BY. Any published use must cite:
*data from GCAT (J. McDowell, planet4589.org/space/gcat)*.

The script filters GCAT organizations to those with a Washington operating location — by
coordinate bounding box, with a text match as cross-check — then finds every payload
attributed to one, and resolves them to NORAD catalog numbers. It writes candidates to
`data/gcat-washington.json`. **It does not write to roster.json**, because every claim
still needs a human signature.

Expect it to surface builders nobody would think to search for. That is the point.

**Two limits to know:**

- GCAT covers owner/operator and prime contractors, **not subsystem contractors**. So
  Aerojet Rocketdyne's Redmond propulsion — which flies on an enormous number of
  spacecraft worldwide — will not appear. "Contains Washington-built hardware" would be a
  far larger and far harder claim, and no public database supports it.
- The script has not been run against the live files. It resolves column names from the
  header rather than assuming them, and fails loudly with the headers it actually found.

## 1. What "Washington-built" means

Needed before anything else, because it changes the roster. Three candidate definitions:

| definition | effect |
|---|---|
| Final assembly location | BlackSky counts (Tukwila factory). Amazon Leo counts. |
| Company headquarters | BlackSky does NOT count (HQ Virginia). |
| Bus manufacturer | Loft Orbital's YAM satellites count, though they fly as Loft. |

**Recommendation: place of manufacture or final assembly**, stated explicitly on the page.
It is the most defensible, it is what GCAT actually records, and it survives the obvious
challenge — "isn't BlackSky a Virginia company?" — because the claim is about the factory,
not the company.

**Never "Washington-launched".** There is no orbital launch site in Washington; everything
on this map lifted off from Florida, Vandenberg or Wallops. That error would be caught in
the first thirty seconds at the Kickoff.

## 2. Per-company confirmations

| id | claim | what to confirm |
|---|---|---|
| `starfish` | Otter Pup — Tukwila | Still on orbit and operational? |
| `starcloud` | Starcloud-1 — Redmond | What is on orbit; catalog name; is the Oct 2026 satellite up? |
| `blacksky` | Built by LeoStella, Tukwila | Which definition (§1) applies. HQ is Virginia. |
| `loft-yam` | LeoStella buses flying as Loft Orbital | **Which YAM tail numbers.** Not all are LeoStella. Needs NORAD IDs. |
| `sherpa` | Spaceflight Inc., Seattle | Which tugs are alive vs. dead and drifting. Do dead ones count? |
| `huskysat` | UW, Seattle | HuskySat-1 launched 2019 — has it decayed? |
| `starlink` | SpaceX Redmond | Confirm Redmond is assembly, not just component production. |
| `kuiper` | Amazon, Kirkland/Everett | Which site, and confirm the Amazon Leo rename in catalog names. |
| `xplore` | Bellevue (was Redmond) | Current location; whether XCRAFT is on orbit at all. |
| `hubble-network` | Seattle | Flies as hosted payloads — may have no distinct catalog object. |
| `portal` | Bothell — **disabled** | Did the 2026 first launch happen? |
| `blue-origin` | Kent — **disabled** | Most conspicuous omission. What is on orbit, and under what name? |

## 3. The 65% figure

The Kickoff reveal rests on this number, so it needs to survive being questioned by a room
of people who build satellites.

- **Source and date.** Conflicting figures are in circulation: an Alliance Velocity page
  states more than 65% of operational satellites are built in the greater Seattle area,
  while a 2022 Washington state source stated 38% of operational satellites at the start
  of that year. Both are advocacy publications.
- **Denominator.** 65% of *what* — all operational satellites, all LEO satellites, all
  commercial satellites? The answer is almost certainly dominated by Starlink volume,
  which is worth stating plainly rather than letting someone discover it.
- **Currency.** A percentage of a constellation count moves every month.
- **Framing.** Must read as "currently operational in orbit", never as a historical
  manufacturing total.

The page has a slot for this claim that renders **only** when a source URL and an
as-of date are supplied. It will not display an unsourced number.

## 4. The TLE format is running out — decide before September

CelesTrak ran out of 5-digit catalog numbers in July 2026. New objects now receive 6-digit
numbers (100000+), and **GP data for them is not published in the legacy TLE format** this
project currently requests.

Consequence: any Washington-built spacecraft catalogued after July 2026 will be silently
absent. Starcloud's second satellite was slated for October 2026; recent Amazon Leo and
Starlink batches are affected too. The failure is invisible — the fetch succeeds, the
object simply is not in the response.

Fix: switch the fetch to `FORMAT=json` (OMM) and build propagator state from OMM fields
instead of parsing TLE columns. Affects `scripts/fetch-tles.mjs`, the bundled fallback
propagator, and the paste path. Half a day of work; should happen before the roster is
finalised, not after.

## 5. Spacecraft type is an editorial classification

The type labels on the dome (imager, servicer, tug, orbital data center, cubesat) do not
come from any catalog. The orbital catalog distinguishes only **payload, rocket body and
debris** — everything not a rocket body or debris is a payload. Every spacecraft on this
map except spent stages would be catalogued simply as "payload".

The finer types are ours, assigned per operator in `roster.json`, and exist to make the
sky readable. That is defensible, but it must be described as a Space Northwest
classification rather than implied to be catalog data. The footer now says so.

## 6. Data reality check — not yet done

`scripts/fetch-tles.mjs` has never run against live CelesTrak. Every validation so far
used synthetic elements. The first real run is the highest-information hour available and
should happen immediately, because it may show that several sources return nothing.

```sh
node scripts/fetch-tles.mjs
```

Read the per-source log. Sources returning zero print their `verify` note.

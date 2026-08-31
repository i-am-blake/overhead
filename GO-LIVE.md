# Go-live checklist

Ordered by what blocks what. Items 1–3 gate everything else.

## Blockers — data

- [ ] **1. Run the preflight.** No proxy is needed — the fetch is server-side, so
      CORS does not apply, and CelesTrak's endpoints are public APIs meant to be
      called programmatically. Either locally:
      ```sh
      node scripts/check-sources.mjs
      ```
      or with no local setup at all: push the repo, open **Actions → Check data
      sources → Run workflow**. GitHub runners have open egress. It reports
      reachability *and* whether each source still has the columns we expect, then
      dry-runs the real fetch and tells you whether the result is real data or
      still placeholder.

      If you are behind a corporate proxy, Node's built-in fetch ignores
      `HTTP_PROXY` but curl does not:
      ```sh
      curl -o gp.json 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'
      node scripts/fetch-tles.mjs --offline gp.json
      ```

- [ ] **2. Run the live fetch and read the per-source log.** Expect surprises on
      `xplore`, `hubble-network`, `huskysat`. A source returning zero prints its
      `verify` note — that tells you whether it is a catalog naming issue or a dead
      spacecraft.

- [ ] **3. Seed from GCAT and review the candidates.**
      `node scripts/seed-from-gcat.mjs --print` → `data/gcat-washington.json`.
      Expect builders nobody thought to search for. Nothing enters the roster
      without a human deciding.

## Blockers — decisions only Space Northwest can make

- [ ] **4. Ratify the definition.** A full one now exists in `roster.json` under
      `definition`, with a five-step decision order. Space Northwest owns it. The
      five calls it makes, each of which someone should agree with explicitly:
      a bus built in Washington counts but gets tagged (the Loft YAM case);
      components alone do not (Aerojet's Redmond propulsion); the factory counts
      regardless of who owns it (LeoStella/BlackSky); multi-site production names
      the integration site (Amazon: Kirkland or Everett?); and dead-but-on-orbit
      does not count as operational (the older Sherpa tugs).
- [ ] **5. Decide whether propulsion counts.** Aerojet Rocketdyne/Redmond is in GCAT
      and reachable via the `Motor` field. Including it makes the Washington
      footprint dramatically larger and the claim dramatically broader.
- [ ] **6. Sign off every attribution.** `source_url`, `verified_by`, `verified_on`
      in `roster.json`. **Currently 0 of 10 are signed** and the page says so on
      screen until they are.
- [ ] **7a. Wire the operational filter.** `DECAY_DATE` and `OPS_STATUS_CODE` are
      already fetched but unused. The page claims counts reflect spacecraft
      "currently operational in orbit" — right now that is asserted, not checked.
- [ ] **7. Confirm each spacecraft is alive.** Otter Pup, HuskySat-1, and the older
      Sherpa tugs are the doubtful ones. A decayed satellite on the dome is what
      that room will notice first.
- [ ] **8. Source the 65% figure or drop it.** Needs source, denominator, date, and
      "currently operational" framing. A 2022 state source said 38%. Do not put an
      unsourced number on the Kickoff screen.
- [ ] **9. Reconcile Amazon's location.** Roster says Kirkland; GCAT says Seattle.

## Deploy

- [ ] 10. Public repo, Pages on, Actions workflow permission set to read/write.
- [ ] 11. Run the workflow once. Confirm it commits `data/tles.json`.
- [ ] 12. Ask Space Northwest for a subdomain. Costs them one DNS record and makes
       this an official asset rather than a side project.
- [ ] 13. Confirm the status line turns green and reports element age.

## Kiosk build — separate from the web page

- [ ] 14. Fixed 1920×1080, nothing below the fold, no scrolling.
- [ ] 15. Type sized for a room, not arm's length.
- [ ] 16. The key and the notice sit below the fold on a monitor. Either auto-cycle
       views or move them up — the compliance notice in particular must be visible.
- [ ] 17. Run the baked standalone file, not the hosted page. Conference wifi.
       `node scripts/fetch-tles.mjs && node scripts/bake.mjs`
- [ ] 18. Burn-in mitigation: slow one-or-two-pixel drift on the container.
- [ ] 19. Kiosk browser, auto-restart, sleep disabled.

## Watch items

- [ ] 20. **Scheduled workflows disable after 60 days of repo inactivity.** Push a
       commit or run it manually the week before.
- [ ] 21. **Re-bake the standalone file within a day or two of the Kickoff.**
       Elements go stale; a file baked in August will have drifted by late September.
- [ ] 22. Accessibility pass — the dome is colour and shape encoded with no text
       equivalent beyond the pass table.

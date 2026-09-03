# Overhead

**Washington-built satellites passing over Seattle, in real time.**

More spacecraft are built in Washington State than anywhere else on Earth. Almost none
of it is visible from the ground — the factories are unmarked, the launches happen in
Florida and California, and the satellites themselves are just moving points of light.

This page makes the region's output visible. It shows what is above Seattle right now,
when the next one will be bright enough to see with your eyes, and where to look.

**→ [i-am-blake.github.io/overhead](https://i-am-blake.github.io/overhead/)**

---

## How to use it

**The dome** is the sky above Seattle, seen as though you were lying on your back looking
up. The outer edge is the horizon, the centre is straight overhead. North is at the top.
Mount Rainier sits low in the south-southeast, where it actually is.

**Orange means sunlit.** A satellite is only visible from the ground when it is catching
sunlight while you are standing in darkness — which is why the good passes come in the
hour or two after dusk and before dawn. Blue-grey satellites are overhead but in Earth's
shadow, and you will not see those.

**The callout** below the dome tells you the next pass worth walking outside for. When it
says *Go outside*, you have ten minutes.

**Next passes** lists what is coming over the next twelve hours. Filter by company, or
tap any row to watch that pass replayed on the dome.

**Sample and All.** By default the dome draws a readable subset — spread across every
orbital plane so the sky looks like the sky, with room for names and trails. Switch to
*All* to see the entire Washington-built fleet at once. It becomes a scatter of unlabelled
dots, which is the point: that is the actual volume.

**The time control** lets you scrub forward up to fourteen hours to see what a pass will
look like before it happens.

---

## Where the numbers come from

**Positions** come from [CelesTrak](https://celestrak.org), a non-profit that publishes
orbital data freely. A scheduled job fetches the catalog once a day, so the page never
queries CelesTrak directly — however many people are watching, the load upstream stays at
one request a day.

**Who built each satellite** comes from Space Northwest research and documented sources,
seeded from [GCAT](https://planet4589.org/space/gcat), Jonathan McDowell's catalogue.
GCAT is unusual in recording the *factory* rather than the parent company, which is what
makes this possible at all: no orbital catalogue has a manufacturer field.

**Positions are approximate.** They are calculated from published orbital elements using
standard propagation, not live telemetry. This is a visualization for a general audience
and is not intended for navigation, collision avoidance, conjunction analysis, or any
operational use.

**Washington-built** means the satellite's main body was manufactured here, or it was
assembled here before launch. Company headquarters, operator, and launch site do not
count — nothing on this map launched from Washington. Counts reflect satellites operating
in orbit now, not everything the state has ever built.

---

## Built for Seattle Space Week

Made for [Space Northwest](https://spacenorthwest.org) for Seattle Space Week 2026, whose
theme is *Scaling the Space Economy*.

Designed and developed by
[Blake Erickson](https://www.linkedin.com/in/ericksonblake/).

Orbital data from CelesTrak. Manufacturer data from GCAT (J. McDowell,
[planet4589.org/space/gcat](https://planet4589.org/space/gcat)), used under CC-BY.

No accounts, no tracking, no analytics. It is one static page.

---

## Use and reuse

The design and code of this project are **not licensed for commercial use**. You are
welcome to view it, share it, write about it, and adapt it for personal, educational, and
journalistic purposes with attribution. See [LICENSE](LICENSE) for the full terms.

The underlying data is a separate matter and carries its own terms. Orbital data is
published freely by CelesTrak. Manufacturer data from GCAT is licensed CC-BY, which
permits commercial use and requires attribution — that licence is not affected by
anything here.

This is a visualization for a general audience. It is not intended for navigation,
collision avoidance, conjunction analysis, or any operational use.

---
name: OpenFleet
description: One change, every repo. The website for OpenFleet, built on the Superluck design system.
colors:
  ground: "#0E0E10"
  ground-raised: "#1C1B21"
  ground-raised-2: "#26252C"
  ground-raised-3: "#2E2D35"
  ground-line: "#45434C"
  on-ground: "#F4F4F6"
  on-ground-muted: "#A8A6AF"
  card: "#EEF0F2"
  card-sunk: "#DFE2E6"
  ink: "#2B1E1B"
  ink-muted: "#5F5754"
  luck-cyan: "#48A6EE"
  luck-magenta: "#EE5AD6"
  luck-yellow: "#EDEB3C"
  counter-blue: "#1632E6"
  success: "#17703A"
  warning: "#8A5300"
  warning-bg: "#FFF1CC"
typography:
  display:
    fontFamily: "Russo One, Arial Black, Impact, sans-serif"
    fontSize: "clamp(40px, 8.6vw, 120px)"
    fontWeight: 400
    lineHeight: 0.92
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Russo One, Arial Black, Impact, sans-serif"
    fontSize: "clamp(32px, 4.6vw, 56px)"
    fontWeight: 400
    lineHeight: 1.02
  page-title:
    fontFamily: "Russo One, Arial Black, Impact, sans-serif"
    fontSize: "clamp(44px, 8vw, 88px)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.01em"
  section-title:
    fontFamily: "Russo One, Arial Black, Impact, sans-serif"
    fontSize: "34px"
    fontWeight: 400
    lineHeight: "40px"
  title-lg:
    fontFamily: "Russo One, Arial Black, Impact, sans-serif"
    fontSize: "28px"
    fontWeight: 400
    lineHeight: "32px"
  logotype:
    fontFamily: "Russo One, Arial Black, Impact, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1
  title:
    fontFamily: "Russo One, Arial Black, Impact, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.2
  title-sm:
    fontFamily: "Russo One, Arial Black, Impact, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.3
  lead:
    fontFamily: "Saira Semi Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: "30px"
  body:
    fontFamily: "Saira Semi Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: "30px"
  caption:
    fontFamily: "Saira Semi Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "22px"
  label:
    fontFamily: "Russo One, Arial Black, Impact, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "22px"
    letterSpacing: "0.1em"
  mono:
    fontFamily: "Share Tech Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: "26px"
  mono-sm:
    fontFamily: "Share Tech Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
  lcd:
    fontFamily: "Share Tech Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "28px"
    fontWeight: 400
    lineHeight: 1
  lcd-lg:
    fontFamily: "Share Tech Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "48px"
    fontWeight: 400
    lineHeight: 1
  lcd-sm:
    fontFamily: "Share Tech Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1
rounded:
  xs: "3px"
  inner: "6px"
  sm: "8px"
  md: "16px"
  lg: "28px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  section: "clamp(72px, 9vw, 120px)"
components:
  button-primary:
    backgroundColor: "{colors.luck-cyan}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 28px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "#6BB8F2"
    textColor: "{colors.ink}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.on-ground}"
    rounded: "{rounded.sm}"
    padding: "0 24px"
    height: "52px"
  button-ghost-hover:
    backgroundColor: "{colors.ground-raised}"
  nav-bar:
    backgroundColor: "{colors.ground-raised}"
    rounded: "{rounded.pill}"
    padding: "8px 8px 8px 20px"
  nav-link:
    textColor: "{colors.on-ground-muted}"
    rounded: "{rounded.pill}"
    padding: "11px 14px"
  nav-link-current:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  figure-panel:
    backgroundColor: "{colors.ground-raised}"
    textColor: "{colors.on-ground}"
    rounded: "{rounded.lg}"
    padding: "22px"
  command-chip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ground}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    height: "44px"
  stat-tile:
    backgroundColor: "{colors.card}"
    textColor: "{colors.counter-blue}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "16px 18px"
---

# Design System: OpenFleet

## Overview

**Creative North Star: "The Arcade Dispatch"**

OpenFleet's site borrows Superluck's arcade energy (scrolling marquees, the cyan-magenta-yellow tri-colour, heavy squared caps, LCD numbers and buttons with a hard key shadow you can press) and puts it to work dispatching a fleet of agents. The page should feel like a cabinet that has been rewired into a control desk: loud and fun at the edges, exact and readable where the real content is.

The personality is **loud edges, calm core**. The tri-colour and display caps live in the frame: the marquee bands, the footer stripe, kicker chips, the one primary button and the hero headline. Everything people actually read (explanations, captions, event logs, commands) stays in plain sentence-case Saira on a near-black ground or on light cards, with real commands and real event names as the content. Numbers are heroes: run times, event counts and test tallies are set big in the mono LCD face.

The world is dark-first and flat. Depth comes from tonal steps of the ground (ground → raised → raised-2) and from light cards set against the dark, never from soft shadows or gradients. The only shadow is the hard ink key under something you can press.

**Key Characteristics:**

- Near-black ground, off-white cards, ink text on cards.
- Tri-colour (cyan, magenta, yellow) always appears together, in that order, as fills, strokes and stripes.
- Russo One caps for headlines, buttons and labels; Saira for reading; Share Tech Mono for anything that counts or is typed.
- Live, replayable diagrams (swimlanes, hubs, tallies) as the signature illustration, drawn in tokens rather than imagery.
- Flat surfaces, one hard key shadow, thick rounded corners.

## Colors

A dark arcade ground with bright paper cards and a three-colour signature that is used in confident, small doses.

### Primary

- **Luck Cyan** (#48A6EE): the lead brand colour. Logotype, the single primary button, planner bars, playheads and focus rings on ground. It is never text on a light card.

### Secondary

- **Luck Magenta** (#EE5AD6): second stripe of the tri-colour. Implementer bars, added-line counts in diffs, link underlines and the kicker chip's middle stripe.

### Tertiary

- **Luck Yellow** (#EDEB3C): third stripe. Tester bars, LCD clocks and counters on ground, the "you" moments (approval, assumptions), the selected-state highlight and the text-selection colour.
- **Counter Blue** (#1632E6): numbers and live values on light cards (stat tiles, contract-test cells, step numbers). It is the only saturated colour allowed as text on a card.

### Neutral

- **Arcade Ground** (#0E0E10): page background and the base of every section.
- **Raised Ground** (#1C1B21): nav bar, figure panels, note boxes and hover fills on ground.
- **Raised Ground 2** (#26252C): inner wells inside raised panels (table cells, idle lanes).
- **Raised Ground 3** (#2E2D35): hover fills on ground, copy buttons and visited phase cells.
- **Ground Line** (#45434C): hairline borders, dividers, dashed lane guides and ghost-button outlines.
- **On Ground** (#F4F4F6): primary text on the dark ground.
- **On Ground Muted** (#A8A6AF): secondary text, captions, inactive nav links and labels on ground.
- **Card Paper** (#EEF0F2): light card surfaces (stat tiles, report cards, the command list, step captions).
- **Card Sunk** (#DFE2E6): wells inside cards (code chips, empty test cells).
- **Ink** (#2B1E1B): warm near-black text on cards, button text and borders, and the colour of the key shadow.
- **Ink Muted** (#5F5754): secondary text on cards.

### Status

- **Success** (#17703A): passing tests and "done" only.
- **Warning** (#8A5300 on #FFF1CC): failed-then-retried work only, always with a word ("FAIL", "1 failing").

### Named Rules

**The Tri-colour Order Rule.** Cyan, magenta and yellow appear together and in that order wherever they appear as a set (marquee bands, footer stripe, kicker chip, role colours planner → implementer → tester).

**The No Tri-colour Text on Card Rule.** Cyan, magenta and yellow never set text on a light card; they fail contrast there. On cards, text is ink, ink-muted or counter blue.

**The Status Is Reserved Rule.** Green and amber only ever mean state, and always come with a word or icon, never colour alone.

## Typography

**Display Font:** Russo One (with Arial Black, Impact)
**Body Font:** Saira Semi Condensed (with Arial Narrow, system-ui)
**Label/Mono Font:** Share Tech Mono (with ui-monospace, SF Mono, Menlo)

**Character:** heavy, squared arcade caps for the frame, paired with a narrow, friendly sans for reading and a mono that makes every number and command look like a live readout.

### Hierarchy

- **Display** (Russo One 400, clamp(40px, 8.6vw, 120px), line-height 0.92, tracking -0.02em, uppercase): the hero headline only ("ONE CHANGE. EVERY REPO.").
- **Page title** (Russo One 400, clamp(44px, 8vw, 88px), line-height 0.98, sentence case): the h1 on inner pages such as How it works.
- **Headline** (Russo One 400, clamp(32px, 4.6vw, 56px), line-height 1.02, sentence case): home-page section headings.
- **Section title** (Russo One 400, 34px / 40px, 26px on phones): numbered section headings on reading pages.
- **Title large** (Russo One 400, 28px / 32px): bento and feature card titles.
- **Title** (Russo One 400, 22px) and **Title small** (16px): card and step titles, button labels (uppercase, 0.02em tracking).
- **Lead** (Saira Semi Condensed 500, 20px / 30px): the intro paragraph under a page title.
- **Body** (Saira Semi Condensed 500, 18px / 30px): all prose, kept to about 68 characters per line (max 720px columns).
- **Caption** (Saira Semi Condensed 500, 14px / 22px): figure captions, keys, notes and the source line.
- **Label** (Russo One 400, 12–13px, 0.06–0.1em tracking, uppercase): kickers, figure titles, stat captions and log headers, in on-ground-muted or ink-muted. Never below 12px.
- **Mono** (Share Tech Mono 400, 17px; small 13px): commands, file paths, event names and timestamps.
- **LCD** (Share Tech Mono 400, 28px; 24px on phones; **LCD large** 48px for step numbers and hero stats): clocks and every counted value.

### Named Rules

**The Caps at the Edges Rule.** Uppercase display caps are for the hero, buttons, labels and kickers. Headings below the hero and all reading text stay in sentence case.

**The Numbers Are Heroes Rule.** Durations, counts and tallies are set in the mono face, large, with the unit or label after the number.

## Layout

Single-column storytelling on a centred container: the home page uses a 1200px max container with 24px gutters; reading pages use a 720px prose column and 1120px wide figures inside the same frame. Sections breathe with fluid vertical padding (clamp(72px, 9vw, 120px)). Grids are simple: two-column card and diff grids, a five-up stat row that becomes two-up on tablets, and side-by-side diagram plus event log that stacks on narrow screens.

The top nav floats as a sticky pill 12px from the top. Wide diagrams scroll sideways inside their own panel on small screens rather than shrinking text; the page itself never scrolls sideways. Breakpoints follow Superluck (480, 720, 960, 1200) with page-specific steps at 640 and 860. Every layout is checked at 390px.

## Elevation & Depth

Flat by default. Depth is tonal: the ground steps up from Arcade Ground to Raised Ground to Raised Ground 2, and light cards sit on top as the brightest layer. There are no soft or ambient shadows and no gradients.

### Shadow Vocabulary

- **Key shadow** (`box-shadow: 0 4px 0 0 #2B1E1B`): under the primary button and anything pressable. On press it collapses to `0 0 0 0` while the element moves down 4px.
- **Lit outline** (`box-shadow: 0 4px 0 0 #EDEB3C` with a yellow border): the one active stage or step in a diagram.

### Named Rules

**The One Hard Shadow Rule.** The only shadow is the hard ink key offset under things you can press or that float. If it isn't pressable or floating, it has no shadow.

## Shapes

Generous rounded rectangles throughout: 28px on large cards and figure panels (16px on phones), 16px on stat tiles, notes and inner repo panels, 8px on buttons, code chips and table cells, 6px on a button nested inside an 8px chip, 3px on inline code, small bars and test cells, and full pills for the nav bar, nav links and the selected state. Borders are 2px (ink on cards and buttons, ground line on ground); hairlines are 1px. Circles and thick rings appear in the logo mark and the coordinator hub. Dashed lines mark waiting, dependencies and lane guides.

## Components

### Buttons

Chunky arcade keys: tactile, obvious and pressable.

- **Shape:** gently rounded (8px), 2px ink border, 52px tall on desktop (44px minimum).
- **Primary:** luck cyan fill, ink uppercase Russo One label, 4px ink key shadow. One per view.
- **Hover / Active:** hover lightens to #6BB8F2; active drops 4px and the key shadow collapses (80ms, cubic-bezier(0.2, 0.8, 0.2, 1)).
- **Ghost:** transparent with a 2px ground-line border and on-ground label; hover fills raised ground and brightens the border.
- **Small replay / copy buttons:** cyan or #2E2D35 fills, 6–8px radius, 12–14px display caps.

### Chips

- **Kicker chip:** a tri-colour stripe followed by a small display-caps label in cyan or magenta, above section headings.
- **Command chip:** ink well, mono command text in on-ground, with a COPY button at the end.

### Cards / Containers

- **Corner Style:** 28px for cards and figure panels, 16px for nested panels.
- **Background:** card paper with ink text on ground pages; raised ground with a 2px ground-line border for figure panels that hold diagrams.
- **Shadow Strategy:** none (see The One Hard Shadow Rule).
- **Internal Padding:** 22–24px desktop, 14–18px on phones.

### Navigation

- **Top nav:** a floating raised-ground pill with a ground-line hairline, logotype in cyan on the left, links in on-ground-muted Saira 600 on the right.
- **States:** hover fills #2E2D35 with on-ground text; the current page inverts to a card-paper pill with ink text. Never mark the current page with colour alone.
- **Mobile:** links fold into a disclosure menu under 720px.
- **Footer:** opens with the 8px tri-colour stripe, then the logotype, licence line and a row of muted links.

### Marquee

Three stacked full-bleed bands in cyan, magenta and yellow, each scrolling a line of ink display caps separated by small ink diamonds, alternating direction. Used at the top of the hero frame and the how-it-works page. Stops under reduced motion.

### Run Diagrams (signature)

Replayable figures that show a run: a swimlane with one lane per repo, a coordinator hub with packets flying to repos, a phase table, a diff by file, a decisions stepper and a test tally. Each sits in a figure panel with a display-caps title, a replay button, a scrubber, a yellow LCD clock and a one-line key under the header. Diagrams are drawn as inline SVG and HTML from tokens, never as raster images, and every one has a static end state for reduced motion.

**The One Meaning Rule.** Inside a diagram, each colour means one thing on every figure: luck cyan = planner, luck magenta = implementer, luck yellow = tester. The coordinator and contracts are on-ground white; **you** (the person) is always a dashed white outline; done is card paper; a failure is warning amber (#8A5300 on #FFF1CC) with the word FAIL or FAILING. Diff bars are neutral (white for added, a muted outline for removed) with a NEW tag for new files; test tallies use success green for a repo's own tests and counter blue for contract tests. Brand colour in a figure's chrome (the title dots, the clock) is frame, not data.

### Stat Tiles

Card-paper tiles with a big counter-blue mono value and a small ink-muted display-caps caption underneath.

## Do's and Don'ts

### Do:

- **Do** keep exactly one luck-cyan primary button with the 4px ink key shadow per view.
- **Do** use the tri-colour together and in order: cyan, magenta, yellow.
- **Do** set every duration, count, path, command and event name in Share Tech Mono.
- **Do** show the product with real commands, file names and event types drawn as live diagrams, and label mocked runs as illustrative.
- **Do** use a 2px cyan focus outline with a 3px offset on ground, and keep every target at least 44px.
- **Do** give every animation a reduced-motion version that shows the end state.

### Don't:

- **Don't** use gradients, glows, blurs or soft drop shadows.
- **Don't** set cyan, magenta or yellow text on a light card.
- **Don't** use green or amber for anything except state, or without a word.
- **Don't** put display caps on body text or headings below the hero; only labels, buttons, kickers and the hero are uppercase.
- **Don't** let the page scroll sideways; wide diagrams scroll inside their panel.
- **Don't** add stock photos, illustrations of robots or generic AI imagery; the diagrams are the imagery.

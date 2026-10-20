---
target: site/how-it-works.html
total_score: 20
max_score: 32
na_heuristics: 5,9
p0_count: 0
p1_count: 3
target_identity: "file:/home/claude/openfleet/site/how-it-works.html"
target_fingerprint: "sha256:02a01935f1c8c71a4e640cdff49d1d5222f262bfdced609d5631cce4ca024eb3"
target_path: /home/claude/openfleet/site/how-it-works.html
timestamp: 2026-10-20T01-41-00Z
slug: site-how-it-works-html
closed: true
---

Method: dual-agent (A: design review · B: detector + browser)

# Critique: How it works page (site/how-it-works.html)

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                                                                                                                                                    |
| --------- | ------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1         | Visibility of System Status     | 3         | Clocks and playheads work; but the swimlane's time bar and legend ignore the playhead, the diff's per-repo totals stay at their final values during replay, and the 177/177 total goes blank while tests run |
| 2         | Match System / Real World       | 3         | Real event names and phases; plan-review, post-test, worktree and contract rows are never defined                                                                                                            |
| 3         | User Control and Freedom        | 3         | Scrubbers and pause work; figures autoplay from 0:00 on scroll, and keyboard scrubbing moves 0.3s per arrow press                                                                                            |
| 4         | Consistency and Standards       | 2         | Three control models; the copy says "four" decisions but there are 5 steps; the "amber" failed cell is orange #EB6834; "22/23 · 1 FAILING" is shown in success green                                         |
| 5         | Error Prevention                | n/a       | No user input that can go wrong                                                                                                                                                                              |
| 6         | Recognition Rather Than Recall  | 2         | Colour keys sit below each figure; step buttons are bare "1"–"5"; the tri-colour changes meaning per figure                                                                                                  |
| 7         | Flexibility and Efficiency      | 2         | No link to a step or time, no speed control, no raw events view                                                                                                                                              |
| 8         | Aesthetic and Minimalist Design | 2         | 4:40 / 23 / 177 repeated 3–5 times before figure 1; the swimlane shows its phases three times; two phase columns are all "<1s"                                                                               |
| 9         | Error Recovery                  | n/a       | No error states in the interface                                                                                                                                                                             |
| 10        | Help and Documentation          | 3         | Good captions, schema link and `pnpm demo`; no phase glossary, no route to Quick start                                                                                                                       |
| **Total** |                                 | **20/32** | **Acceptable (63%)**                                                                                                                                                                                         |

## Design Specificity Verdict

**LLM assessment:** The figures belong to this product: titled by real event types, realistic multi-language paths, the yellow "you" moment showing the single point where a person was involved, and a contract node fanning out to seven repos. A competitor couldn't reuse them. The page around them is a generic long-read: kicker, giant headline, five-tile number row, then numbered prose and figure pairs. Six figures share almost the same frame, so after the third they blur. The ending is not specific to OpenFleet.

**Deterministic scan:** 42 findings with DESIGN.md loaded (16 without; the detector only finds DESIGN.md beside the scanned file).

- Brand patterns, not issues: marquee ×2, hero eyebrow chip ×1, wide tracking on caps labels ×4, cramped padding on the full-bleed bands ×3.
- Partly true: tiny text ×5 (11px labels).
- Design-system drift ×27:
  - Real one-off values: radii 2/4/6/10/12/20px; colours #DCDBE0, #34333A, #FFFFFF, #8A817D and #EB6834; the h1 clamp(44–88px) matching neither type token; h2 34px; LCD sizes 24/28/30px; nav overrides.
  - Missing tokens rather than drift: #2E2D35, and label/title size ranges the frontmatter lists as single values.
  - One parser false positive (the font check).
- Browser-only findings: bounce easing on the diff bars (cubic-bezier(0.3, 1.5, 0.5, 1), ×46 elements) is likely true against "calm core"; nested cards ×8 is the figure-panel-in-panel pattern DESIGN.md describes.
- No contrast failures; the lowest pair is green on card at 5.38:1.
- 174 visible text nodes are under 14px, down to 10px in SVG.
- No horizontal page overflow at 390px or 1280px.
- Both reviews agree on small text and the failed-cell colour. The detector found the bounce easing and the radius/colour sprawl, which the design review didn't flag.

**Visual overlays:** The overlay was injected in a headless browser: 63 findings at 1280px, 61 at 390px. There is no human-visible [Human] tab in this environment.

## Overall Impression

The figures are the best thing on the site and the reason to visit. The page is weak in three places: the frame around them, colour meanings that change from figure to figure, and an ending that goes nowhere. The biggest opportunity is to make the page about trust (the failure, the retry, the assumption, a person approving) rather than about a mocked 4:40, and to finish with "start your own run".

## What's Working

- **Figures named after the event log.** EVENTS.JSONL, PHASE.CHANGED, TEST.RUN, numbered events 1–203: "every step is on the record" is shown, not claimed.
- **The decisions stepper.** One `contracts/account.json` node, seven repo chips, and only the affected chip lights per step, with a plain-language caption. It is the clearest explanation of coordination anywhere on the site.
- **Honest and well-made underneath.** An upfront mock disclosure, `pnpm demo` for the real thing, a real `<table>` with caption and scopes, finished states under reduced motion, and wide figures that scroll inside their panel.

## Priority Issues

**[P1] Colour meanings are overloaded across figures**

- Why it matters:
  - Cyan means planner, removed lines, current phase and "contract updated" in different figures.
  - Magenta means implementer, added lines and "asked a question".
  - Yellow means tester, you, new file, assumption and the clocks.
  - Readers relearn the key six times, and the key is only in captions below each figure.
  - The failed test uses an off-system orange, and "1 FAILING" is shown in success green.
- Fix:
  - Reserve cyan, magenta and yellow for planner, implementer and tester, plus yellow for "you".
  - Draw diff bars in neutral or ink with +/− numbers.
  - Show the failure in the warning token (#8A5300 on #FFF1CC) with the word FAIL.
  - Put a one-line legend in each figure header.
- Command: /impeccable colorize

**[P1] The ending has no next step, and its card is cramped**

- Why it matters: The moment of conviction (177/177 pass, PRs stay drafts) leads nowhere. The command card shrinks to 484px (a flex `margin-inline: auto` with no width), its commands have no COPY buttons, and they are for a run the reader never did.
- Fix:
  - Give `.cmds` and `.source` full width.
  - Use the design system's command chips with COPY.
  - End with one cyan "START YOUR OWN RUN" primary button and an `npm create @openfleet-tools` chip linking to Quick start.
- Command: /impeccable layout, then /impeccable clarify

**[P1] Screen-reader and keyboard gaps**

- Why it matters:
  - Step buttons read as "1, pressed".
  - The step caption, report card, test scores and phase status aren't live regions, so pressing PLAY changes nothing a screen reader announces.
  - SVG figures carry one fixed label.
  - Sliders are 16px tall and move 0.3s per key press.
  - REPLAY and the step buttons are 40px, below the 44px minimum.
  - The marquee scrolls forever with no pause (WCAG 2.2.2).
- Fix:
  - Name each step button and group them.
  - Make the captions and reports `aria-live="polite"`; announce test results once at the end.
  - Add a visually hidden text summary of each figure's final state.
  - Give sliders 44px hit areas and 1-second steps.
  - Add a marquee pause control, or stop it after one pass.
- Command: /impeccable harden

**[P2] The swimlane figure is overloaded and unreadable on phones**

- Why it matters:
  - The project row, time bar and legend repeat the same phases three times.
  - The time bar doesn't line up with the SVG axis and ignores the playhead.
  - SVG labels are 8–11px.
  - At 390px the run squeezes into about 300px, so "SPECIFYING" is cut off and "YOU · 8s" collides with "COORDINATOR".
- Fix:
  - Remove the time bar and legend and put the durations in the project row.
  - Set the smallest SVG text to the equivalent of 12px.
  - On phones, keep the swimlane at about 640px minimum width inside its scroll panel, with a "scroll →" hint.
  - Let log lines wrap.
- Command: /impeccable distill, then /impeccable adapt

**[P2] Autoplay and motion work against the story**

- Why it matters:
  - Figures autoplay from 0:00 on scroll, so the first view is empty lanes and tables.
  - The 1,900px-tall mobile diff keeps playing off screen.
  - The failure the caption describes lasts 1.4 seconds and never appears at rest, and never appears at all under reduced motion.
  - Under reduced motion the stepper advances faster (1.2s per step).
  - The diff bars use a bouncy overshoot easing.
- Fix:
  - Arrive showing the finished state and animate only on REPLAY.
  - Keep sdk-python's failed cell visible at rest, marked RETRIED.
  - Don't auto-advance under reduced motion.
  - Replace the bounce easing with the standard enter curve.
- Command: /impeccable animate

## Persona Red Flags

**Jordan (first-timer):**

- The grill isn't explained until section 07.
- plan-review and post-test are only defined in a caption.
- The copy says "four" decisions and the stepper shows five.
- The colour key changes per figure.
- There is nothing to do at the end.

**Sam (screen reader / keyboard):**

- About 30 tab stops, in good order, with visible rings.
- Step buttons are announced as numbers; replays are silent; SVG content is one fixed sentence.
- Scrubbing 4:40 takes about 1,000 key presses.
- Focusing a figure starts its autoplay.

**Casey (one-handed mobile):**

- 16px scrubbers.
- The stepper wraps "5" onto its own row.
- The phase table needs a sideways swipe, with no hint.
- The diff figure runs about 1,900px with its replay out of view.
- The menu sits in the top corner.

**Platform-team lead judging trust for an org-wide change:**

- "177 / 177 TESTS PASS" in the marquee and the five stat tiles carry no "illustrative" label, so a screenshot reads as a benchmark (PRODUCT.md forbids implying evidence).
- No real artefacts: no `spec.md` excerpt, no grill questions, no raw `events.jsonl` line, no PR body.
- The worst case (child `failed`, dependents `blocked`) isn't shown.
- The assumption, the key governance moment, is step 4 of 5.

## Minor Observations

- Left edges alternate between the 1120px hero axis and the 720px prose column all the way down; the hero's right half is empty.
- The hub's packet dot overlaps the "api" label, and the three arcs around COORDINATOR are unexplained.
- "23 agents" vs "23 sub-agents" plus a coordinator: is it 23 or 24?
- Section 01's heading repeats the hero.
- The "01 · THE WHOLE RUN" kicker is inside the h2's accessible name.
- Dead CSS from an earlier version: `.pipe`, `.stage`, `.rows`, `.render`, `.tally`, `.of-bento`, `.of-compare`.
- Radius sprawl: 2/4/6/10/12/20px alongside the 3/8/16/28 scale.
- The prose colour #DCDBE0 is off-token.

## Questions to Consider

- Is this page about one run, or about trust? If trust, should the failure, retry and assumption be the headline instead of a mocked 4:40?
- Do you need six replayable figures, or one master timeline that drives all of them from a single scrubber?
- The product's evidence is a file. Why not let readers open the 203 mocked `events.jsonl` lines?

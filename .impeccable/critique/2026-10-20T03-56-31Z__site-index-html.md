---
target: site/index.html
total_score: 25
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: "file:/home/claude/openfleet/site/index.html"
target_fingerprint: "sha256:d7703270cc3b9c2a908265a206263d1af272b7044945d75b62b37aa173056193"
target_path: /home/claude/openfleet/site/index.html
timestamp: 2026-10-20T03-56-31Z
slug: site-index-html
---

Method: dual-agent (A: design review · B: detector + browser)

# Critique: home page (site/index.html)

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                                                                                 |
| --------- | ------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     | 3         | Swimlane clock/scrubber/log are good; the hero run can't be paused and its replay only appears at the end                                 |
| 2         | Match System / Real World       | 3         | Real commands and events; "a signed-in coding agent CLI" doesn't say what works today                                                     |
| 3         | User Control and Freedom        | 2         | Hero can't be paused; mobile menu ignores Esc and stays open after a link tap; reduced-motion REPLAY does nothing                         |
| 4         | Consistency and Standards       | 2         | Cyan/yellow/"you" mean different things in hero, swimlane, step cards and How it works; CTA h2 in caps; key shadow on non-pressable cards |
| 5         | Error Prevention                | 2         | Vague agent-CLI requirement invites failed installs                                                                                       |
| 6         | Recognition Rather Than Recall  | 3         | Hero legend uncoloured; swimlane legend far below the bars                                                                                |
| 7         | Flexibility and Efficiency      | 3         | Skip link, anchors, one-click install copy; quick-start lines have no copy buttons                                                        |
| 8         | Aesthetic and Minimalist Design | 2         | 10 sections; pitch restated ~4 times; 8,500px desktop / 12,810px mobile                                                                   |
| 9         | Error Recovery                  | 2         | Copy silently fails without clipboard API; swimlane blank without JS                                                                      |
| 10        | Help and Documentation          | 3         | Good doc links; nothing on supported hosts or maturity                                                                                    |
| **Total** |                                 | **25/40** | **Acceptable**                                                                                                                            |

## Design Specificity Verdict

**LLM assessment:** Specific in content, inconsistent in telling. Built from OpenFleet's own artefacts (repos.json, spec.md, events.jsonl, the branch tree, AFTER SDK-JS, RETRY 1/3, real command flags). Weakened by a pitch said four times, a colour language that changes per module (and contradicts How it works), and an unlabelled hero run.

**Deterministic scan:** 31 findings (17 warn, 14 advisory), identical with DESIGN.md loaded.

- True: tiny text ×5 (11px status chips, replay label, compare labels, mobile run title; breaks the 12px label floor); radius drift ×3 (10px menu link, 20px mobile figure, 2px bars); colour one-off #3a2c28 (replay button); font-size drift ×9 (three headline clamps off-token, 26px clock, 15px mobile terminal, 30px step titles; 19px logo and 48px step numbers are missing tokens).
- Brand / false positives: marquee, cramped padding on bands and padded cards, tight leading on one-line buttons, the &quot; font parser bug.
- Browser: overlay found nested-cards (documented inner panels) and two straggler words at 390. Only contrast failure: the scroll-lit manifesto words sit at 1.21:1 until scrolled well up. Under-44px targets: logo link (26px), swimlane scrubber (16px), one inline link. No horizontal overflow; no page errors.
- Both passes agree on 11px text and the scrubber. The detector caught the off-token headline sizes and the manifesto contrast; the review caught the colour contradictions and the labelling gap.

**Visual overlays:** injected headless only (3 findings at 1280, 9 at 390); no [Human] tab in this environment.

## Overall Impression

The hero and swimlane are the product, drawn. The page's job now is consistency with what How it works became: one colour language, honest labels, and the failure story. The biggest opportunity: replace the repeated manifesto with a teaser of "a test failed, here's how the run handled it".

## What's Working

- **The run swimlane:** scrubbable, a lane per repo, an ordering dependency, a FAIL bar with retry, a synced event log.
- **Copy from real artefacts:** the worktree branch tree, a commands table with real flags, a comparison against "one agent session" that names no competitor.
- **The hero shows messy states:** RETRY 1/3, AFTER SDK-JS, a quoted prompt; the reduced-motion snapshot tells even more.

## Priority Issues

**[P1] Colours contradict the How it works page.** Hero: cyan = in progress, yellow = done. Swimlane: yellow = tester, you, assumption and newest event. Step chips: cyan = with you, yellow = hands-off. How it works: role colours only; you = dashed white. Fix: hero segments by role with ink ring for current, neutral chips, paper DONE; swimlane YOU dashed white, contract/assumption markers white, newest log entry by weight; step chips neutral with dashed "you". Command: /impeccable colorize

**[P1] Runs not fully labelled illustrative.** Hero says "EXAMPLE RUN"; swimlane says "ILLUSTRATIVE TIMINGS" (implies real events). Fix: "ILLUSTRATIVE RUN · ACCOUNT-ID" on both, plus a caption: "Mocked run; every event type is real. Replay a real one with pnpm demo." Command: /impeccable clarify

**[P2] Getting-started trust gaps.** Vague agent-CLI requirement; no copy on quick-start lines; safety note leads with "Tools are auto-approved"; no maturity signal. Fix: requirements link (page stays host-neutral), copy buttons per line, reorder the note to lead with the limits, a status line ("early · MIT"). Command: /impeccable harden

**[P2] Redundant middle, very long page.** Pitch restated about four times. Fix: cut the scroll-lit manifesto (it also fails contrast mid-reveal), add a failure teaser linking to How it works, trim the commands table to new / status / resume. Command: /impeccable distill

**[P2] Mobile and accessibility bugs.** Menu ignores Esc and stays open after a tap; summary misses the cyan focus ring; 16px scrubber with 0.28s steps; swimlane SVG text 9–10px; 11px chips; logo link 26px tall. Fix: close menu on Esc/link, shared focus rule, 44px scrubber with 1s steps, SVG text ≥12px, chips 12px, taller logo hit area. Command: /impeccable adapt

## Persona Red Flags

**Jordan (first-timer):** Can't tell if their agent CLI works; seven new terms in two sections; nav "How it works" leaves the page while the in-page how section has another title.

**Riley (stress tester):** Copy silently fails without the clipboard API; swimlane blank without JS; log truncates "contracts/account.json → 5 r…"; Esc doesn't close menu; reduced-motion REPLAY inert; hero can't be paused.

**Casey (one-handed mobile):** Menu and GitHub in the top corner; menu stays open after navigating; 102×16 scrubber; 26px logo link; mobile hero's events well an empty ~240px box until events arrive.

**Platform-team lead:** No maturity statement; "Tools are auto-approved" is the first safety phrase; no mention of cost, the absent concurrency cap, or secret handling beyond one line; hero's "7 draft PRs opened" not marked mocked; the failure-handling story isn't on the home page.

## Minor Observations

- Marquee sits below the hero here but at the top of the frame on How it works.
- CTA h2 "WRITE ONE PROMPT. RUN IT ACROSS" in caps breaks Caps at the Edges.
- Step cards carry the key shadow but aren't pressable (One Hard Shadow rule).
- Extension cards and CTA repo chips use role colours decoratively.
- "waits on sdk-js" label reads as belonging to web/ui on desktop.
- Mobile swimlane drops GRILL/FINALIZE labels and the coordinator row.
- At 1280×900 the hero card's ending is below the fold.
- Headline sizes use three different clamps instead of the token.

## Questions to Consider

- If your strongest moment is "a test failed and the run handled it", why does the home page lead with everything going right?
- Is the scroll-lit manifesto earning its 475px, or is the page clearing its throat a third time?
- Should the hero card and the swimlane be one figure, so one mocked run is drawn once with one colour code?

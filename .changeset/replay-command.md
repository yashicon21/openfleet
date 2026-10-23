---
"@openfleet-tools/cli": minor
"@openfleet-tools/ui": minor
---

Add `npx openfleet replay <project> [--out <file>] [--open] [--gap <min>]`. It writes `projects/<project>/replay.html`, one offline HTML file that replays the run as an animated 3D world: repos are hex islands, children are buildings that grow with their phase (a rejected plan knocks the building down to rubble, a failed or blocked child gets a red beacon), and agents are robots coloured by role that fly from the coordinator's hub to the child they work on. It has play/pause, speeds from 1× to 600×, a scrubbable timeline with pauses collapsed and shown as night, a time-of-day slider, a sidebar of children by status, an event ticker and a card per child (plan summary, lines changed, plan rejections, tests, agents). The replay reuses the report's run model.

New package `@openfleet-tools/ui`: the pure event reducer and timeline shared by the replay (and later a live dashboard), and the Three.js world renderer with a named slot per object so themes can replace the built-in low-poly models.

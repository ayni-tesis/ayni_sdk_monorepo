---
target: Ayni landing page
total_score: 22
max_score: 36
na_heuristics: 7
p0_count: 0
p1_count: 1
timestamp: 2026-10-06T17-20-01Z
slug: ayni-sdk-monorepo-web-vercel-app
---
Method: dual-agent (A: impeccable_assessment_a · B: impeccable_assessment_b)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | API status visibly transitions from “Checking…” to “Connected”; it does not explain local execution state. |
| 2 | Match System / Real World | 3 | Offline value and Flutter context are clear, but “typed workflow DAG” assumes domain knowledge. |
| 3 | User Control and Freedom | 3 | Registration, dashboard, and dismissible search are clear. |
| 4 | Consistency and Standards | 2 | The live page’s paper/cobalt/green palette conflicts with the documented petroleum/cyan direction; one nav label is Spanish in an English page. |
| 5 | Error Prevention | 2 | The public documentation link points to localhost. |
| 6 | Recognition Rather Than Recall | 3 | The three-stage flow is labeled; technical shorthand still requires interpretation. |
| 7 | Flexibility and Efficiency | n/a | Keyboard efficiency is not a core measure for a one-off Persuade landing page. |
| 8 | Aesthetic and Minimalist Design | 3 | Strong whitespace and hierarchy; the visual language remains category-familiar. |
| 9 | Error Recovery | 2 | Search offers a no-results suggestion, but an API-disconnected state has no explanation or next step. |
| 10 | Help and Documentation | 1 | Documentation is discoverable, but its destination is broken in production. |
| **Total** | | **22/36 (61%; Acceptable)** | Significant improvements needed before users are happy. |

## Design Specificity Verdict

**Independent design review:** The offline promise and Compose → Version → Run story are unmistakably Ayni. The split hero, standard SaaS navigation, and three-stage feature section could belong to many developer tools. The biggest missed opportunity is showing the real workflow canvas or SDK integration rather than only a schematic.

**Deterministic scan:** The CLI detector was skipped as required for a URL target. Browser overlay injection did not run, so there are no in-page detector findings or counts; do not interpret this as a clean scan. No false positives can be assessed.

## Overall Impression

The page explains the offline-first proposition quickly and gives new and returning developers clear paths. The localhost documentation link is the most serious trust break; after that, reconcile the visual contract and make the product tangible.

## What’s Working

- “Workflows that keep working offline” communicates the differentiator immediately and names Flutter in the supporting copy.
- The custom Compose → Version → Run visual connects authoring, immutable release, and on-device execution.
- “Create your workspace” and “Go to dashboard” serve new and returning visitors without competing for the same action.

## Priority Issues

1. **[P1] Documentation link targets localhost.** The live “Documentación” link resolves to `localhost:3002/`. Public visitors will land on their own machine rather than the deployed docs. **Fix:** point the production link at the deployed documentation origin and verify the published destination. **Suggested command:** `$impeccable clarify`.

2. **[P2] The page and documented visual identity disagree.** The live page uses a light paper background, cobalt emphasis, and green status accents; `C:\PROYECTOS\TESIS\ayni_sdk_monorepo\apps\web\DESIGN.md` defines a dark petroleum default and reserves cyan for action/focus/progress. This leaves the product’s visual authority unclear. **Fix:** align the page and the design contract; if the landing page is intentionally an exception, document that explicitly. **Suggested command:** `$impeccable colorize`.

3. **[P2] Product proof is schematic, not demonstrative.** The only product visualization is a three-row workflow diagram; there is no real canvas view or SDK example to validate the promise. **Fix:** add an authentic workflow-canvas preview or a concise, accurate Flutter integration example using only shipped behavior. **Suggested command:** `$impeccable shape`.

4. **[P2] API reachability can blur the offline promise.** “API status” sits under the main CTA and reports control-plane connectivity, not whether a device can run its last verified workflow locally. The observed page reached “Connected”; a disconnected state could imply the product itself is unavailable. **Fix:** label this as control-plane status and explain that local execution can continue offline, or move it out of the hero. **Suggested command:** `$impeccable clarify`.

## Persona Red Flags

- **Jordan (first-timer):** “typed workflow DAG” and “directed acyclic graph” require translation. The obvious help route is broken, so a new developer has no working destination for more explanation.
- **Riley (stress tester):** the localhost docs target fails concretely; if the API status becomes “Disconnected,” the page offers no recovery guidance or distinction from device-local execution.
- **Casey (mobile; CSS-inferred, not viewport-verified):** the narrow layout turns Search into an icon and puts four text links on a second row. Targets appear about 44px high, but the actual narrow viewport was not verified.

## Minor Observations

- “Documentación” is the lone Spanish navigation label on an otherwise English landing page.
- The visible shortcut is “⌘ K” although the search also supports Ctrl+K; Windows users may miss that shortcut.

## Key Learnings:

1. Ayni’s strongest differentiator is the clear offline promise paired with the Compose → Version → Run story.
2. The deployed localhost documentation link is the clearest, directly verified trust failure.

## Questions to Consider

Which should we address first: **fix the documentation destination**, **align the visual identity**, or **add real product proof**?

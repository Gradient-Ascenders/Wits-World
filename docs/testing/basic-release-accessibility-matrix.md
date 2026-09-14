---
title: Basic release accessibility and device matrix
---

# Basic release accessibility and device matrix

Automated semantic/component tests are supporting evidence, not a substitute
for manual keyboard, screen-reader, contrast, reduced-motion, zoom, touch, or
real-device review. The repository does not currently install `axe-core`; do
not report an axe result unless the tool is genuinely added and run through an
authorised change.

For every completed row, record the release/commit, route and state, date,
tester or anonymised run ID, device/browser/assistive technology, expected and
observed behaviour, result (`Pass`, `Fail`, `Limited`, `Not run`), evidence, and
finding ID. A `Not run` row is **Pending manual evidence**, not a pass.

## Coverage matrix

| Area                            | Routes/states                                                                                               | Automated support to inspect                              | Required manual method                                                                                                                | Result                      | Evidence/finding |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------- |
| Mobile layout                   | Register/sign-in, Explore/list/map, challenge/review/reward, collection, decks, CPU battle/history, profile | Responsive component/Playwright assertions where named    | Real phone plus 360/390 px browser; portrait, scrolling, sheets/dialogs, no clipped primary action                                    | **Pending manual evidence** |                  |
| Desktop layout                  | Same core journey                                                                                           | Component tests and deterministic E2E                     | Representative desktop browser; wrapping, focus visibility, no pointer-only action                                                    | **Pending manual evidence** |                  |
| Keyboard only                   | Whole core journey and safe failures                                                                        | Role/name, keyboard activation, and selected focus tests  | Tab/Shift+Tab/Enter/Space/arrows as applicable; no mouse/touch                                                                        | **Pending manual evidence** |                  |
| Visible focus and logical order | Navigation, forms, dialogs, reward, deck validation, battle controls                                        | Selected React Testing Library focus assertions           | Track focus from page entry through completion and after errors                                                                       | **Pending manual evidence** |                  |
| Escape/modal/disclosure         | Dialogs, sheets, menus, confirmations                                                                       | Component dialog/menu tests where present                 | Escape closes only the expected layer; focus returns; disclosures retain meaning                                                      | **Pending manual evidence** |                  |
| Screen-reader semantics         | Landmarks, headings, navigation, forms, statuses, battle updates                                            | Accessible-role/name and live-status component assertions | NVDA + Firefox/Chrome or another named combination; record exact combination                                                          | **Pending manual evidence** |                  |
| Headings and landmarks          | Every core route                                                                                            | Semantic component coverage where present                 | Navigate by headings/landmarks; one clear page heading and meaningful regions                                                         | **Pending manual evidence** |                  |
| Forms, labels, validation       | Registration/sign-in, profile, deck, challenge actions                                                      | Form/client/component tests                               | Labels, instructions, required state, summary, inline error association, focus on failure                                             | **Pending manual evidence** |                  |
| Accessible names                | Icons, map/list switch, cards, menus, battle controls                                                       | Role/name queries                                         | Inspect announced names and distinguish repeated controls                                                                             | **Pending manual evidence** |                  |
| Contrast                        | Text, links, controls, focus, statuses, disabled/error/success states                                       | No complete automated contrast suite                      | Measure representative computed colours with a named WCAG contrast tool and visually inspect non-text focus/components                | **Pending manual evidence** |                  |
| Non-colour status               | Availability, eligibility, correctness, rewards, deck validity, turns/effects/results                       | Text/status regression tests                              | Confirm every meaning has text/icon semantics independent of colour                                                                   | **Pending manual evidence** |                  |
| Reduced motion                  | Navigation, map, loading, reward, sheets/dialogs, battle transitions                                        | No complete automated conformance claim                   | Enable OS/browser reduced motion; verify no essential information depends on motion and no disruptive transition remains              | **Pending manual evidence** |                  |
| Touch targets                   | Navigation, event/list/map controls, answers, cards/deck, battle actions                                    | Focused Playwright touch scenarios where named            | Real touch device; spacing, accidental activation, reachable primary actions                                                          | **Pending manual evidence** |                  |
| Mobile scroll/sheets/dialogs    | Challenge review, collection/deck, battle log, profile confirmation                                         | Responsive browser regressions where named                | Open keyboard and overlays; verify content/action reachability and scroll containment                                                 | **Pending manual evidence** |                  |
| Map/list alternative            | Explore loading, denied permission, map failure, event states                                               | Map-independent deterministic/component assertions        | Complete discovery and retry using the text list with map unavailable                                                                 | **Pending manual evidence** |                  |
| Zoom/text resizing              | Core journey and overlays                                                                                   | No full automated claim                                   | 200% browser zoom and enlarged text where supported; no loss of content/function or two-dimensional trapping except essential layouts | **Pending manual evidence** |                  |

## Viewport/device runs

| Run ID  | Release                     | Device/viewport                 | OS/browser | Input/AT                      | Journey covered                 | Result  | Limitations | Evidence/findings |
| ------- | --------------------------- | ------------------------------- | ---------- | ----------------------------- | ------------------------------- | ------- | ----------- | ----------------- |
| A11Y-01 | **Pending manual evidence** | 360–390 px mobile or real phone |            | Touch                         | Full Basic journey              | Not run | Pending     |                   |
| A11Y-02 | **Pending manual evidence** | 768 px tablet or equivalent     |            | Touch + keyboard if available | Core journey and overlays       | Not run | Pending     |                   |
| A11Y-03 | **Pending manual evidence** | Desktop                         |            | Keyboard only                 | Full Basic journey              | Not run | Pending     |                   |
| A11Y-04 | **Pending manual evidence** | Desktop                         |            | Named screen reader           | Full Basic journey and statuses | Not run | Pending     |                   |
| A11Y-05 | **Pending manual evidence** | Representative device           |            | Reduced motion + 200% zoom    | Core journey and overlays       | Not run | Pending     |                   |

## AI declaration

This empty validation matrix was generated and edited with the assistance of
Codex[GPT-5]. The AI did not operate a real device or screen reader and did not
perform a manual accessibility assessment.

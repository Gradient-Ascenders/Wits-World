# Wits World experience amplification plan

Status: implemented.
Scope: post-sign-in entry, normal loading, Explore, challenge results, and routine success toasts.
Visual authority: [DESIGN.md](DESIGN.md), The Campus Quest Atlas.
Product authority: [PRODUCT.md](PRODUCT.md) and the existing API responses.

## Goal

Make the player experience feel more distinctive at moments that already matter: returning from sign-in, waiting for content, selecting an event, receiving a server decision, and seeing an earned card. Preserve the current flow and its practical mobile behavior. Motion should clarify a state change or mark a real result, finish quickly, and leave content readable and usable throughout.

The work has five parts:

1. A Wits World seal animation for the first sign-in return.
2. A Quest Marker activity indicator and restrained skeleton polish for normal in-app waits.
3. Coordinated feedback for Explore selection and event-range checking.
4. A single reveal for cards awarded in a completed challenge result.
5. A visual and motion refinement of routine success toasts.

## Current implementation and boundaries

- `src/App.tsx` uses one `Suspense` fallback for lazy routes. `src/components/auth/ProtectedRoute.tsx` separately renders Auth0 and current-player restoration states. The seal belongs to the Auth0 sign-in return; these normal loading paths use the Quest Marker.
- `src/components/LoadingState.tsx` supplies a generic circular spinner and `rows`, `cards`, and `battle` skeletons. `src/styles/states.css` gives those variants fixed generic geometry. Several pages also render a `Skeleton` directly; Collection has a separate `.collection-loading-grid` in `src/components/cards/cards.css`.
- Explore already has a selected-marker reveal, a responsive map/sheet, semantic event lists, local status messages, and explicit location and eligibility states. The added motion should follow those states rather than add another source of truth.
- `src/components/challenge/ChallengeResult.tsx` and `ChallengeRewards.tsx` render a completed attempt returned by the API. The score and reward list are authoritative. Artwork is fetched separately and can arrive later or fail.
- `src/components/AppToaster.tsx` uses Sonner for one routine success confirmation at a time, currently used by deck actions. Errors and consequential decisions remain inline.
- The approved transparent seal SVG in `src/assets/branding/wits-world-campus-seal-transparent.svg` contains roughly 240 flat filled paths without semantic groups. The existing `CampusSeal` component renders it as an image. Animation needs a loader-specific layered derivative; the approved mark remains the final visual reference.

## 1. First sign-in return: constructed seal

### Placement and lifecycle

- Introduce a dedicated sign-in return presentation while Auth0, the current player, and the destination route load in parallel. Keep meaningful sign-in and session-status text visible to assistive technology and sighted users.
- Show the seal on the Auth0 sign-in callback. Opening the public home page, restoring an existing session on a normal visit, and later lazy-route navigation use their normal presentation.
- On the sign-in return, keep the screen visible for the complete seal construction, about 700–800 ms, while the destination loads in parallel. This minimum applies only to that return.
- If the route becomes ready during the seal sequence, finish construction before crossfading to the mounted destination over about 120–160 ms. The exiting layer must not intercept pointer or keyboard input.
- If authentication, player restoration, or the destination route lasts longer than one pass, repeat the complete construction sequence. On the Explore destination, absorb map preparation until its first load or error, for at most three additional seconds after the route is ready; then reveal the map's own loading or retry UI after the current pass finishes.
- Keep the public home page free of a seal fallback, including before React paints.

### SVG method and timing

Derive a loader-only SVG from the approved seal geometry. Organize it into a few semantic layers: circular boundaries; campus route and buildings; lettering and small marks; complete seal. Do not animate each of the hundreds of original paths independently. Keep the canonical branding asset unchanged and check that the last frame matches it.

| Approximate interval | Visual event | Technique |
| --- | --- | --- |
| 0–170 ms | Outer and inner boundaries appear | Short gold stroke traces, then the corresponding source geometry settles in |
| 170–450 ms | Route and campus buildings assemble | One or two coordinated masks reveal the central geometry |
| 450–600 ms | Lettering, fine marks, and blue details arrive | Small grouped opacity/mask reveals |
| 600–760 ms | Full seal settles and holds briefly | Replace any construction guides with the complete approved mark |

Use the seal's own gold and blue, without added particle effects, rotations, or bounce. Keep the drawing on compositor-friendly properties where possible. For `prefers-reduced-motion: reduce`, render the complete static seal from the start; loading text and state changes remain available.

## 2. Normal loading: Quest Marker and skeletons

### Quest Marker activity indicator

- Build a compact activity indicator from the approved Quest Marker SVG. Use it where the shared circular spinner currently signals an in-app wait, including the event and trail lists. Give it one restrained repeatable motion with a pause; stop it immediately when the wait ends.
- Keep the indicator small and contextual. A route-level wait may show it beside the loading title; an inline wait may show it beside the status label. The accompanying text identifies what is loading or being checked.
- Under reduced motion, show the static marker with the same text. Avoid turning the marker into a fake progress meter or implying that location or eligibility is known before the API responds.
- Keep existing skeletons where they make the future layout easier to anticipate. Use the marker as the distinctive activity signal; skeleton surfaces should remain quiet.

### Skeleton audit and geometry changes

Inventory every use of `LoadingState`, `Skeleton`, and local placeholder styles before changing the shared CSS. For each loading state, compare the placeholder container, columns, heights, and spacing with the loaded component at mobile, tablet, and desktop widths. Update a shared variant only when its consumers share the same geometry; otherwise give the route a small local variant.

| Existing placeholder | Audit targets | Intended geometry |
| --- | --- | --- |
| `rows` | Explore event list, trail list/detail, challenge restoration, match entry/history, profile, offline and Author lists | Align bars with the final list or panel width, row spacing, and likely text/action positions. Reserve the final panel's main vertical space when practical. |
| `cards` | Collection and Decks loading states | Match the collectible/deck grid column count, card proportions, gutters, and container width at each breakpoint. Audit Collection's separate square loading grid and remove or reconcile contradictory geometry. |
| `battle` | CPU and PvP match restoration | Reflect the major battle panels and their responsive stacking so the battle surface does not jump from two arbitrary blocks. |
| Direct loading panels | Challenge and other pages that compose `Skeleton` without `LoadingState` | Retain their page-specific headings and status copy while using consistent quiet placeholder surfaces. |

Skeleton surfaces use subtle Night Sky tonal steps and the existing radius language. Keep them static; do not add a prominent shimmer or a second looping animation. Reserve stable dimensions for known headers and panel regions without fabricating exact data counts. When authoritative content arrives, replace the placeholders immediately with a brief opacity handoff at most. Do not wait for that handoff before exposing the loaded content. Reduced motion removes the handoff.

The audit includes shared-component consumers outside the initial Explore/reward scope so a change to `states.css` does not degrade offline or Author loading screens. It does not expand the feature work on those routes.

## 3. Explore selection and eligibility feedback

- Keep the map-independent event list, mobile sheet behavior, location-permission flow, and current marker/selection logic.
- On deliberate event selection, coordinate one short marker emphasis with the sheet's change to event details. Refine the existing selected-marker reveal rather than starting a persistent pulse or moving the whole map unnecessarily.
- During location acquisition or server range checking, show a compact Quest Marker activity cue beside the existing contextual status text. Keep “Checking range” and similar messages visible; do not show “In range” until the API confirms it.
- On a confirmed result, let the status treatment settle once into the existing reachable/unreachable state. Preserve retry actions and the detailed handling for denied, stale, uncertain, unsupported, and unavailable location states.
- Avoid replaying an emphasis on every background eligibility refresh or minor location sample. The moment belongs to a player selection or a meaningful server decision.
- Keep map movement, marker effects, and sheet transitions inexpensive on mobile, with a static state change under reduced motion.

## 4. Challenge result and earned-card reveal

- Render the completed score, saved-result status, actions, and review content immediately from the completed API response.
- If cards were awarded, play one brief card reveal on the initial display of that completed attempt. The card frame should remain recognizably the existing collectible; use a small lift/settle and a contained light pass rather than a flip, confetti, or a long sequence.
- Key the reveal to the completed attempt and awarded card identities so an artwork refresh, React rerender, or navigation back to the result does not repeatedly celebrate the same award during that visit.
- Artwork can arrive after the server result. Keep the frame and card name visible; reveal or fade in only the artwork when it loads. Preserve the existing artwork-failure notice and retry control.
- For zero-card results, show the existing honest no-award message without a card reveal. A timeout result keeps its explicit timeout language and saved-answer status. Under reduced motion, show the final static card immediately.
- Preserve `View collection`, `Return to explore`, keyboard focus, answer review, and the server-derived score and rewards.

## 5. Routine success toasts

- Keep Sonner, one visible routine confirmation at a time, the 5-second duration, close control, and mobile offset above player navigation.
- Refine the toast into the Campus Quest Atlas language with restrained icon treatment, spacing, border/depth, and a brief enter/exit motion. Use success green for meaning; keep Trail Blue for actions and Beacon Gold for world/identity cues.
- Keep messages concise and specific. Do not turn errors, authorization problems, location failures, or server-owned decisions into celebratory toasts. Those remain near the relevant action with their recovery controls.
- Check long text, narrow mobile widths, keyboard dismissal/focus, and reduced motion. The toast must not cover a primary action or the bottom navigation.

## Implementation order

1. Record a compact motion storyboard for the seal, Quest Marker, Explore feedback, reward, and toast. Establish durations and reduced-motion outcomes before editing components.
2. Derive the loader-only seal layers and visually compare their final frame to the approved SVG.
3. Implement the sign-in return boundary and short minimum, followed by a non-blocking seal exit. Keep public home visits and later route loads on the normal path.
4. Audit skeleton call sites and implement Quest Marker plus geometry adjustments together, using local variants where shared geometry is inappropriate.
5. Implement Explore's one-shot selection/checking feedback and the completed-result reward reveal.
6. Refine the shared toast styling and motion without changing its use policy.
7. Inspect all affected states in one batched browser pass, make a focused correction batch if needed, then confirm once.

## Review and acceptance

Inspect the running app at **390 px, 768 px, and 1440 px**. Include a public home visit, fast and slow sign-in returns, a later route transition, Explore loading/selection/range checking, challenge results with one or two awarded cards and with no award, artwork loading/failure, a routine success toast, and reduced motion. Use local fixtures for states that cannot safely be reached on demand; label those captures as fixture evidence.

The pass is ready when:

- The seal has a legible ring → campus geometry → fine detail → complete mark sequence, and its final frame matches the approved seal.
- The first sign-in return repeats the complete 760 ms seal sequence while its route or map is unresolved, finishes its current pass when ready, and crossfades into the app; public home visits and routine waits use the normal experience or the Quest Marker and appropriate skeletons without a minimum delay.
- Skeletons resemble the loaded component geometry closely enough to avoid a conspicuous panel or grid jump at the inspected widths. They remain visually subordinate to content and the Quest Marker.
- Explore communicates checking and confirmed results distinctly, without implying an unconfirmed eligibility decision or disrupting location permissions and recovery.
- Rewards animate only when actually awarded by the server; scores, cards, and review content remain available immediately and accurately.
- Success toasts remain readable, dismissible, and clear of the mobile navigation; errors stay inline.
- All motion has a usable reduced-motion presentation. Focus, status announcements, controls, and navigation remain available throughout transitions.

No automated tests will be added or run as part of this plan unless requested. Browser inspection will establish visual behavior; it will not substitute for a live backend acceptance check.

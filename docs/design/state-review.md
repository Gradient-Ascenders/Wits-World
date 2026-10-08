---
title: 'Interaction states'
description: Loading, updates, validation, errors, and confirmations across the application.
---

# Interaction states

Feedback stays beside the content, form, or control it describes. Independently
usable parts of the page remain available while another operation waits.

## State overview

| State              | What the interface shows                                                | Available next step                                                     |
| ------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Initial loading    | A page loading seal or a placeholder in the waiting region              | Continue using independent controls; recovery appears for a longer wait |
| Refreshing         | Confirmed content with a local update indicator                         | Wait or retry a failed update                                           |
| Empty result       | An explanation of what belongs in the list                              | Take the relevant first action, where one exists                        |
| No search matches  | A message distinct from having no records                               | Change or clear the filters                                             |
| Validation error   | An explanation beside the affected input                                | Correct the draft and submit again                                      |
| Failed request     | A local error, rather than an empty result                              | Use the operation's recovery control                                    |
| Pending submission | Progress beside the action or inside its dialog                         | Await confirmation; duplicate submissions are disabled                  |
| Confirmed success  | Updated saved state and, for routine deck actions, a brief notification | Continue with the confirmed result                                      |
| Unavailable action | A visible reason, such as an incomplete deck or an access requirement   | Resolve the requirement where possible                                  |

## Loading

Page preparation or sign-in readiness uses a branded loading seal. Smaller
sections use quiet, stationary placeholders. Protected content stays hidden
until identity and access are confirmed. Completed work appears immediately,
without waiting for an animation to finish.

Explore prepares the map and event discovery together. Events become available
as soon as their read finishes, even if the map is still loading. A map failure
leaves the event list available with a separate map retry.

After 8 seconds, shared loading states show **Taking longer than usual** and
relevant recovery controls. A read may offer retry; Home and Saved Events provide
ways to leave the wait. The threshold reveals help rather than predicting a
completion time. Startup failures also provide recovery rather than an endless
loader.

## Refreshing and retained content

Within an open page, updates retain safe, confirmed content, filters, and draft
inputs. When a changed filter or page still displays earlier rows, **Showing
previous results** identifies them until the requested read finishes. A failed
update does not confirm the requested view.

Collection and Author-console revisits can briefly show previous results while
fetching a fresh view. This is not persistent draft storage or preservation of
every page across navigation. Signing out or losing access clears protected
content.

## Validation and failed requests

Field errors remain beside the input. Failed saves keep the draft while the
editor is open. Failed reads use user-facing explanations and relevant recovery
controls; raw infrastructure diagnostics are omitted.

Empty data, no search matches, failed requests, and access requirements are
presented as distinct conditions. An unavailable button has a visible explanation
when its restriction affects the task.

## Submitting and confirming

A submission is separate from its successful outcome. Pending saves, trades, and
battle actions identify what is waiting and prevent duplicate submissions.

A slow submission explains that its result remains unconfirmed. Leaving the page
does not cancel an action already submitted to the server. Recovery checks that
operation's status or receipt before another submission; a generic retry does
not repeat the action.

Routine deck confirmations use a brief, dismissible notification. A new
confirmation replaces the previous one, and the saved state remains visible in
the page. Decisions, errors, and recovery information stay in the page or dialog.

## Background work

Saved-attempt synchronisation runs in the background, with progress and retry
controls on Saved Events and the affected attempt. The offline notice links to
saved content without taking over the current page.

Application updates wait for a safe point rather than replacing an active
challenge or editor. Live connections, opponent waits, and ranked proposals use
that feature's own status and deadline.

A loading state appearing or disappearing does not move keyboard focus by itself.
For focus behaviour, status announcements, and motion preferences, see
[Accessibility](design-system.md). Design rationale is covered in
[UI/UX design](ui-ux-design.md).

AI declaration: Rewritten with assistance from Codex[GPT-6].

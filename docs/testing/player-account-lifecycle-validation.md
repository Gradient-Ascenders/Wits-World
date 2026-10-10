---
title: 'Account recovery and deletion checks'
---

# Account recovery and deletion checks

Issue `#161` implements the protected `/account` journey on top of issue
`#160`'s server-authoritative deletion lifecycle.

## Implemented boundary

- `GET /api/v1/auth/me` returns the validated safe provider category alongside
  the local Player Name, role, and lifecycle state. It does not return email,
  external subject, issuer, tokens, or provider profile data. The reset form's
  optional email prefill is read from the Auth0 browser user profile, not this
  API response.
- Auth0 database users use the protected `/account/reset-password` route. The
  editable email input is prefilled from Auth0 `user.email` when present, is
  request-only, and is neither persisted nor logged. The browser calls Auth0's
  `dbconnections/change_password` endpoint; Auth0 owns recovery email delivery
  and the hosted replacement-password page. The account settings action is an
  internal link, not a Universal Login redirect.
- Google users receive provider-specific guidance and continue to Google's
  account recovery. Direct route visits by Google users show no Auth0 email
  form. Wits World never claims to manage that credential.
- Deletion requires the ordinary API bearer token, a separately acquired Auth0
  ID token no more than five minutes old, an exact identity match, and the exact
  permanent confirmation. The server remains authoritative for all checks and
  cleanup outcomes.
- Accepted deletion locks access immediately. `completed` and `retry_pending`
  are distinct player-visible states; an ambiguous browser/API failure can
  safely retry the idempotent server operation.
- No Wits World page or component collects a current or replacement password.
- Accepted Auth0 requests and provider `404` responses receive identical
  neutral confirmation; that response does not claim a password changed or an
  email was delivered. Requests have a bounded timeout, pending-submit lock,
  retryable network/provider errors, and a rate-limit message for HTTP 429.
- The optional public `VITE_AUTH0_DATABASE_CONNECTION` setting defaults to
  `Username-Password-Authentication`; no new mandatory environment setting is
  introduced. No Auth0 client secret, Management API, Wits World API, or
  database change is part of password recovery.

## Automated coverage

Component tests cover database and Google recovery guidance, absence of
password fields, keyboard dialog cancellation and focus restoration,
reauthentication parameters, explicit final acknowledgement, completed and
retry-pending deletion, expired proof, safe error references, and ambiguous
failure retry.

API integration tests cover the additive provider-category contract, exact
runtime validation, authorisation, reauthentication proof, completed deletion,
and persisted retry-pending responses. Database integration covers locking,
transactional cleanup and rollback, retry, concurrency, anonymous retention,
audit expiry, and clean re-registration.

The focused Playwright account scenario uses controlled Auth0 and API fixtures
to inspect the database-account queued-cleanup journey at `390×844` and the
Google-provider account page at `1280×800`. It checks keyboard activation,
Escape cancellation, focus restoration, checkbox activation, result focus,
password-input absence, horizontal overflow, and console/runtime errors. It is
browser rendering evidence, not real Auth0 email-delivery or production
deletion evidence. Those earlier scenario results do not constitute coverage of
the new dedicated reset form or endpoint behavior.

### Dedicated reset checks, 9 October 2026

Checks used local changes on branch `fix/dedicated-password-reset`, based on
`main` revision `d50215a`. Requests and identities were controlled fixtures;
no reset emails were sent and no Neon database tests were run.

- The account, environment, and password-recovery Vitest files passed all 51
  tests, covering internal navigation, email validation/prefill, provider-specific
  recovery, neutral confirmation, error/retry, rate limits, cancellation, and
  the 15-second request timeout.
- The account Playwright suite passed all eight scenarios. Dedicated reset
  scenarios checked keyboard activation, pending controls, confirmation focus,
  return navigation, screenshots, and absence of horizontal overflow at 390px
  and 1280px. Google direct-route recovery was checked separately.
- An initial wider web run passed 1,206 tests and failed one overly broad
  signed-out fetch assertion. That assertion was corrected to prohibit
  protected-account and reset requests, rather than unrelated event discovery,
  and passed in the focused rerun above.
- The subsequent full monorepo `npm test` gate passed all 3,012 executed tests,
  including all 1,207 web Vitest tests and three web-server tests. Database
  integration was explicitly disabled: 461 API database tests were skipped,
  and database URLs were overridden with unused local placeholders, not Neon.
  The local runtime was Node.js `24.15.0` and npm `11.12.1`; the repository
  specifies npm `11.18.0`.

These results do not verify real Auth0 email delivery or hosted password replacement.

## Required external and manual verification

Use dedicated development accounts and never record credentials, tokens, email
contents, or Auth0 browser storage in screenshots or logs.

1. Sign in with an Auth0 database account, open `/account`, and follow **Reset
   password**. Confirm it navigates internally to `/account/reset-password`
   without `loginWithRedirect`. Check that Auth0 `user.email` prefills the
   editable email field when present, and that editing it does not persist it
   or expose it in application logs.
2. Submit a controlled request and verify the browser sends JSON `client_id`,
   `email`, and `connection` to the configured Auth0 domain's
   `/dbconnections/change_password` endpoint, with no password values or
   secrets. Verify bounded timeout, disabled pending submit, retryable network
   and provider errors, and the HTTP 429 message. Confirm accepted and `404`
   responses render the same neutral message without asserting delivery or
   password change.
3. Confirm the Auth0 SPA Allowed Origins (CORS) includes the exact current
   local and production web origins and has no wildcard. Confirm the optional
   `VITE_AUTH0_DATABASE_CONNECTION` default is used when unset.
4. For a Google account, confirm `/account` retains Google-specific recovery,
   and direct navigation to `/account/reset-password` does not render the
   Auth0 email form.
5. Confirm an Auth0 database-user request reaches the configured mailbox and
   its email link opens Auth0-hosted password replacement. Complete a reset and
   verify sign-in using the new password; this is a manual real-provider check.
6. At approximately `390×844`, use only the keyboard or mobile assistive input
   to open deletion, cancel with Escape, reopen it, complete Auth0
   reauthentication, toggle the final acknowledgement, and confirm the result
   heading receives focus. Repeat the layout inspection at approximately
   `1280×800`.
7. Confirm a stale or cancelled Auth0 return cannot delete the account and
   offers a fresh identity check. Confirm a successful request signs out after
   **Finish and return home** and cannot access protected routes again.
8. Correlate only the safe deletion reference with API operational logs. If a
   controlled test environment can induce provider or local cleanup failure,
   confirm the account stays locked and the automatic retry completes without a
   second destructive browser action.

## Confirmed limitations and follow-up

- The reset-request response cannot establish whether Auth0 delivered an email
  or whether the player completed hosted password replacement. Real provider
  configuration, email delivery, and hosted-page behavior remain unverified.
- Once deletion locks the local account, ordinary player authorisation cannot
  expose a polling endpoint without weakening that lock. The browser reports
  the initial `completed` or `retry_pending` response; persisted server retries
  and operational alerts provide recovery after that point.
- Real Auth0 reset email delivery, hosted-page wording, reset Allowed Origins
  (CORS), Google recovery behavior,
  tenant `auth_time`, Management API permission, and production logout remain
  external/operator evidence. Controlled component, API, database, and browser
  tests do not replace it.
- No new database migration is required for issue `#161`; issue `#160` already
  provides the transactional lifecycle, retention matrix, retry state, and
  minimal audit record.

The preceding document was generated and edited with the assistance of:
Codex[GPT-5], Codex-CLI[GPT-5].

Page title clarified with assistance from Codex-CLI[GPT-6].

The dedicated password-reset documentation was updated with assistance from
Codex-CLI[gpt-6-luna]. The local verification record was added with assistance
from Codex[GPT-5].

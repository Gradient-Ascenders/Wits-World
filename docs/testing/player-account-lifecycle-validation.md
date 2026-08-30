# Player account lifecycle validation

Issue `#161` implements the protected `/account` journey on top of issue
`#160`'s server-authoritative deletion lifecycle.

## Implemented boundary

- `GET /api/v1/auth/me` returns the validated safe provider category alongside
  the local Player Name, role, and lifecycle state. It does not return email,
  external subject, issuer, tokens, or provider profile data.
- Auth0 database users enter password recovery through Universal Login. Auth0
  owns identifier collection, recovery email, and both password fields.
- Google users receive provider-specific guidance and continue to Google's
  account recovery. Wits World never claims to manage that credential.
- Deletion requires the ordinary API bearer token, a separately acquired Auth0
  ID token no more than five minutes old, an exact identity match, and the exact
  permanent confirmation. The server remains authoritative for all checks and
  cleanup outcomes.
- Accepted deletion locks access immediately. `completed` and `retry_pending`
  are distinct player-visible states; an ambiguous browser/API failure can
  safely retry the idempotent server operation.
- No Wits World page, component, API schema, test fixture, or documentation
  introduces a password input.

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
browser rendering evidence, not real Auth0 or production deletion evidence.

## Required external and manual verification

Use dedicated development accounts and never record credentials, tokens, email
contents, or Auth0 browser storage in screenshots or logs.

1. Sign in with an Auth0 database account, open `/account`, choose **Reset
   password**, and confirm Universal Login offers its hosted recovery action
   without a Wits World password field.
2. Submit the dedicated account identifier only on Auth0. Confirm the newest
   recovery email reaches the configured mailbox and its link opens an Auth0
   hosted replacement-password page. Confirm the new credential signs in and
   an older link fails safely according to the tenant policy.
3. Sign in with a Google account and confirm `/account` shows Google guidance,
   opens Google's recovery service in a new tab, and never offers the Auth0
   database recovery action.
4. At approximately `390×844`, use only the keyboard or mobile assistive input
   to open deletion, cancel with Escape, reopen it, complete Auth0
   reauthentication, toggle the final acknowledgement, and confirm the result
   heading receives focus. Repeat the layout inspection at approximately
   `1280×800`.
5. Confirm a stale or cancelled Auth0 return cannot delete the account and
   offers a fresh identity check. Confirm a successful request signs out after
   **Finish and return home** and cannot access protected routes again.
6. Correlate only the safe deletion reference with API operational logs. If a
   controlled test environment can induce provider or local cleanup failure,
   confirm the account stays locked and the automatic retry completes without a
   second destructive browser action.

## Confirmed limitations and follow-up

- Universal Login does not report hosted password-reset completion to this SPA.
  The return state confirms only that the player came back from the recovery
  entry point and advises using the newest Auth0 email.
- Once deletion locks the local account, ordinary player authorisation cannot
  expose a polling endpoint without weakening that lock. The browser reports
  the initial `completed` or `retry_pending` response; persisted server retries
  and operational alerts provide recovery after that point.
- Real Auth0 email delivery, hosted-page wording, Google recovery behavior,
  tenant `auth_time`, Management API permission, and production logout remain
  external/operator evidence. Controlled component, API, database, and browser
  tests do not replace it.
- No new database migration is required for issue `#161`; issue `#160` already
  provides the transactional lifecycle, retention matrix, retry state, and
  minimal audit record.

The preceding document was generated and edited with the assistance of:
Codex[GPT-5], Codex-CLI[GPT-5].

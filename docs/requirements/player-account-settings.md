---
title: 'Account settings'
description: Open account controls, recover access, change device preferences, and understand account deletion.
---

# Account settings

Open the account menu beside your Player Name and choose **Account settings**,
or go to `/account`. **Account details** shows your Player Name, sign-in method,
and role. Profile pictures, status, favourites, and sharing are managed separately
through [Player profile](../design/profile-showcase.md).

## Recover your password

For an email/password account, choose **Reset password** under **Security**.
On the Auth0 sign-in page, choose **Forgot password?** and follow the recovery
email. Use the latest email link. Returning to Wits World does not confirm that
your password changed.

For Google sign-in, choose **Open Google recovery**. Google manages that password;
the Wits World account page cannot reset it.

If recovery cannot open, check your connection and try again. The app's sign-in
control also offers **Switch account** when a previous account binding remains.

## Preferences and API access

**Accessibility** includes read aloud, motion, contrast, interface size, reading
layout, and font choices. Changes apply immediately and are saved in the current
browser on this device. See [Accessibility](../design/design-system.md) for the
controls, keyboard interaction, and reset behaviour.

**Developer API access** is optional. If you need to connect another application,
follow the [Developer API guide](../architecture/developer-api.md) for creating,
storing, and revoking keys.

## Delete your account

Account deletion is permanent. If you have [offline attempts](player-offline-journey.md)
pending, cancel deletion to sync and review them first.

1. Under **Account deletion**, choose **Delete account**.
2. Choose **Sign in again** and authenticate with the same account.
3. Read the final confirmation, acknowledge that your account and progress will
   be lost, and choose **Permanently delete account**.
4. Read the returned status and keep the deletion reference if cleanup is pending.

**Cancel deletion** closes a confirmation before submission. Once the server
saves the request, signing out or closing the browser does not cancel it.

Deletion removes your account, sign-in identity for this app, cards, decks,
points, achievements, profile, and personal progress. Required shared battle,
trade, moderation, and Author history can remain without your account or profile.
Signing up again creates a new player with no restored progress. See
[Deletion and retained data](../database/account-deletion-retention.md) for details.

**Account locked. Deletion pending.** means the request is saved and cleanup will
retry automatically; game access remains blocked. If the page cannot confirm
deletion, use its offered recovery action to check and finish the same request.
If it asks you to sign in again, authenticate before confirming again.

## Sign out safely

The account menu provides **Sign out**. Signing out, switching accounts, or
deleting an account clears local offline data when cleanup succeeds. A warning
lets you cancel before discarding unsynced attempts. If cleanup fails, follow
the warning and clear the site's browser data before leaving a shared device.

---

This guide was written and checked against the current account controls,
password recovery, and deletion flow with assistance from Codex[GPT-6].

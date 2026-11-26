# SRP-ESPORTS Season 6 Admin Panel

## What this branch changes

- Replaces the old generic database editor with the Season 4-style admin workspace adapted for Season 6.
- Uses Firebase Authentication plus the existing `role: master` custom claim.
- Keeps the login screen and admin workspace on `admin.html`; removes the redundant cancel/back control from the login card.
- Adds dedicated Team, Player, Match Center, Tournament Progression, Content & Settings, Season Tokens, Sub-admins and Backups sections.
- Moves the dashboard styling into `css/admin.css` and behaviour into `js/admin-panel.js`.
- Keeps `vault.html` as a compatibility redirect to `admin.html`.
- Updates the service-worker cache so the new admin assets are loaded after deployment.
- Adds Firebase Cloud Functions for creating, updating, resetting and disabling sub-admin accounts.
- Adds a proposed role-scoped Firestore rules file. The rules are not deployed by GitHub Pages or by merging this branch.

## Publish the website changes

1. Review and merge the pull request into `main`.
2. Wait for the repository's GitHub Pages deployment to finish.
3. Open `https://srp.lazernode.in/admin.html` and sign in with the existing Firebase master account.

The pull request changes the website repository only. It does not sign you in, alter the master account, or deploy Firebase backend services.

## Enable sub-admin account management

Cloud Functions must be deployed separately. Firebase currently requires the Blaze billing plan to deploy Cloud Functions. Review your billing settings and set a budget alert before enabling billing.

From a terminal with Node.js 22 and Firebase CLI installed:

```bash
npm install -g firebase-tools
firebase login
firebase use srpweb-52fd9
cd functions
npm install
cd ..
firebase deploy --only functions
```

The callable functions run in `asia-south1`. They require a signed-in master account and never expose a service-account key to the browser.

## Firestore rules deployment

The `firestore.rules` file is the proposed ruleset for the admin permissions model. It preserves public reads for the public tournament collections, gates sub-admin writes by the live `sub_admins/{uid}` record, and denies unlisted collections by default.

**Review this file before deploying it.** Check that no other part of your Firebase project reads or writes additional Firestore collections. Once confirmed, publish it with:

```bash
firebase deploy --only firestore:rules
```

Do not deploy the rules blindly if you have other collections or workflows that are not represented in this repository.

## Backups

The admin panel exports a JSON backup of teams, players, matches, tournament slots, tournament matches, tokens and settings. Restore uses merge writes and does not delete records absent from the backup. Keep backup files private because they contain tournament and registration data.

## Current limitations

- The public registration form still uses its existing Netlify Forms workflow. The Season Tokens panel creates and manages Firestore token records, but token redemption has not yet been connected to that public form.
- The panel does not yet include a registration-application review queue.
- Sub-admin creation, password reset and permission changes remain unavailable until the Cloud Functions are deployed and the reviewed Firestore rules are published.

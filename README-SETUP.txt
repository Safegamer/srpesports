SRP-ESPORTS SEASON 6 — WEBSITE PROJECT

PROJECT STRUCTURE
  index.html                 Home / leaderboard / match centre
  tournament.html            Grove League, knockout, playoffs and final
  players.html               Player directory and MVP
  rules.html                 Rules, scoring and prize pool
  save-trees.html             Season 6 Save Trees campaign page
  register.html               Team application page (Netlify Forms)
  register-success.html       Registration confirmation page
  hall-of-fame.html           Published season archive
  admin.html / vault.html     Temporary safe placeholders until Batch 4
  css/theme.css               Shared theme and components
  js/firebase.js              Firebase compat shared core
  js/tournament.js            Public tournament renderer
  js/secondary-pages.js       Rules / registration / archive renderers
  app.webmanifest             PWA manifest
  sw.js                      Service worker
  icons/                      PWA icons

FIREBASE PROJECT
  Project ID: srpweb-52fd9
  Firebase web config is in js/firebase.js. The web API key is intended for the browser; Firestore rules and trusted authorization are the security boundary.

FIRESTORE COLLECTIONS / DOCUMENTS USED BY THE PUBLIC PAGES
  teams, players, matches, tournament_slots, tournament_matches
  settings/tournament, settings/rules, settings/past_season

CURRENT FIRESTORE SECURITY POSITION
  Public reads are enabled only for the listed tournament data. Writes are denied.
  Do not change rules to allow public writes. Do not treat client-side/localStorage login checks as security.
  Batch 4 must replace the old browser-only admin login with Firebase Authentication plus trusted, server-enforced authorization before admin writes are enabled.

REGISTRATION FORM NOTE
  register.html uses Netlify Forms when registrationOpen=true in settings/tournament and team capacity remains. Applications go to the Netlify Forms inbox for manual review. They are NOT written into Firestore or automatically approved. Do not promise an approved slot from the form receipt.
  To open registration, set registrationOpen=true in settings/tournament. To close it, set registrationOpen=false. Confirm the form is detected in the Netlify Forms dashboard after deploying this version.

INSTALL / UPDATE
  Extract the project and preserve the folder layout. For the existing GitHub repository, upload the new HTML pages plus js/secondary-pages.js at their matching paths, then commit and push. Netlify should deploy automatically.
  Do not put the project inside an extra nested folder. The root of the publish directory must contain index.html.

CUSTOM DOMAIN (NETLIFY)
  Add srp.lazernode.in in Netlify > Site dashboard > Domain management > Add a domain you already own. Choose external DNS if your DNS remains with the registrar/provider.
  In the DNS zone for lazernode.in, add CNAME host/name srp -> target srpwebsite.netlify.app. Remove only conflicting records for the srp host; do not alter the apex domain or email MX/TXT records.
  Use Netlify's Pending DNS verification instructions if the dashboard provides a different target. After DNS verifies, wait for Netlify HTTPS certificate provisioning.
  Add srp.lazernode.in to Firebase Authentication > Settings > Authorized domains when you begin using Authentication on the custom domain.

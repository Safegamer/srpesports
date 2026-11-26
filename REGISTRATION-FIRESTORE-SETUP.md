# SRP-ESPORTS registration setup (Spark plan)

The registration page now writes a token-backed pending application directly to Firestore, so it does not call Cloud Functions. GitHub Pages does **not** publish Firestore security rules; publish the rules once from Firebase Console.

## One-time setup

1. Wait for the latest GitHub Pages deployment to finish.
2. In Firebase Console, select project `srpweb-52fd9` and open **Firestore Database → Rules**.
3. Review and publish the rules from `firestore.rules` in this repository.
4. Sign into `admin.html` with the existing master administrator account. The dashboard initializes the registration reservation counter from the current teams and pending applications.
5. Open **Season Tokens** and click **Prepare existing tokens** once. This creates SHA-256 document IDs for legacy tokens and marks their old documents as migrated; it does not delete the old records. New tokens are created in the compatible format automatically.
6. Test one registration with a fresh token. Check that the application appears under **Team Applications**. Approving creates the team and players; rejecting returns the token and releases the reserved slot.

## What the rules permit

Public visitors can read only the tournament data already public on the site. A visitor who knows a valid token can read only that unused token document, and can atomically mark it used, reserve one place, and create one pending application. The token list and application data remain private to administrators. Master-only application review and the existing custom claims are unchanged. These rules do not add public access to teams, players, or settings writes.

Publishing rules changes Firestore access controls for this project. No records are deleted by the rules update. Review the rule diff before publishing; do not paste the file into the GitHub Pages site.

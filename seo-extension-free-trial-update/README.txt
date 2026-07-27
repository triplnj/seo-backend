SEO EXTENSION — 3 FREE GENERATIONS UPDATE

BACKEND
=======
Add these NEW files:

src/models/TrialUsage.js
src/services/trialUsage.js
src/routes/trial.js

Replace these files:

src/routes/generateBrief.js
src/index.js

Keep these existing files unchanged:

src/services/lemonLicense.js
src/routes/license.js
src/mongodb/db.js

Render environment variables:

FREE_TRIAL_LIMIT=3
EXTENSION_ENABLED=false   (while testing)

MONGO_URI must still be configured because trial usage is stored in MongoDB.
After deployment and testing, set:

EXTENSION_ENABLED=true

FRONTEND
========
Replace:

popup.html
popup.css
popup.js
manifest.json

Keep your working background.js unchanged.
The manifest version in this package is 1.4.0.

BEHAVIOR
========
1. A new installation receives a generated device ID.
2. The backend stores only a SHA-256 hash of that ID.
3. The user gets 3 successful free generations.
4. Failed OpenAI requests do not consume a trial generation.
5. During the trial, all existing extension features remain available.
6. After the third successful generation, the Pro upgrade and license activation panel appears.
7. A valid Lemon Squeezy license removes the trial restriction.

TEST RESET
==========
For development only, delete the relevant TrialUsage document from MongoDB and clear extension storage in Chrome.
Uninstalling/reinstalling may generate a new device ID, so this is a per-installation trial rather than a verified per-person trial. Preventing resets reliably would require user accounts/login.

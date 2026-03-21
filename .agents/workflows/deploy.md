---
description: How to deploy the Startmine application to Firebase Hosting
---

## Deploy Steps

// turbo-all

1. Run the auto-versioning deploy script:
```
powershell -ExecutionPolicy Bypass -File Deploy.ps1
```

This single command does everything:
- Auto-injects a unique timestamp into all `?v=` references in `index.html` and `sw.js`
- Updates the Service Worker cache name to force cache refresh
- Runs `firebase deploy`

**IMPORTANT**: Do NOT run `firebase deploy` directly. Always use `Deploy.ps1` to ensure cache busting works correctly.

**IMPORTANT**: Do NOT manually change `?v=X.X` version strings in `index.html` or `sw.js`. The deploy script handles this automatically.

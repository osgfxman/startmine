# Startmine

> Bookmark & productivity hub with Miro-like infinite canvas. Built with Vanilla JS — no frameworks, no bundlers.

## 🤖 AI Agent? Start Here

If you are an AI model, coding assistant, or automated agent working on this project, follow these steps in order:

### Step 1: Understand the project
Read **[ARCHITECTURE.md](./ARCHITECTURE.md)** completely. It contains:
- Full directory structure with description of every file
- Script load order (critical — do not change without reading)
- Data model (D object, pages, widgets, miroCards)
- Storage strategy (4 layers: Memory → localStorage → IndexedDB → Firebase)
- Offline/Realtime sync architecture
- Canvas engine internals
- Global functions mapping (HTML inline handlers)
- Deployment rules

### Step 2: Learn the safety rules
Read **[AGENTS.md](./AGENTS.md)** completely. It contains:
- How to add or modify features safely
- Forbidden patterns that cause crashes (infinite recursion, data loss)
- Testing checklist
- Module communication rules
- File naming conventions

### Step 3: Read the file before editing it
Every JS file starts with a `@module` header that tells you:
- `@description` — what the file does
- `@depends` — what must load before it
- `@provides` — what functions/variables it exports
- `@safety` — rules specific to this file

**Never modify a file without reading its @module header first.**

### Step 4: After making changes
- [ ] Update `ARCHITECTURE.md` if you changed: file structure, script order, global functions, or storage
- [ ] Update `AGENTS.md` if you discovered a new dangerous pattern
- [ ] Add `@module` header to any new JS file
- [ ] Add new files to `sw.js` STATIC_ASSETS array
- [ ] Add new script tags in `index.html` respecting load order (see ARCHITECTURE.md)
- [ ] Use same `?v=` value as existing files (Deploy.ps1 updates it automatically)
- [ ] Verify `SM.core.runHealthCheck()` would still pass with your changes
- [ ] Add new exported functions to `health.js` checks

### Step 5: Forbidden actions
- ❌ `function X() { return window.X(...arguments); }` → causes infinite recursion
- ❌ Deleting data before confirming replacement is ready → causes data loss
- ❌ Running `firebase deploy` directly → use `Deploy.ps1` only
- ❌ Changing `?v=` values manually → `Deploy.ps1` handles this
- ❌ Adding script tags after `app.js` → it must be the last script
- ❌ Creating function declarations in `app.js` that match names in other modules

## 🛠️ Tech Stack
- **Frontend:** Vanilla JS + CSS (no frameworks, no bundlers)
- **Backend:** Firebase Realtime Database
- **Auth:** Google Sign-In (Drive, Calendar, Tasks scopes)
- **Hosting:** Firebase Hosting
- **PWA:** Service Worker + Web App Manifest

## 📁 Key Files
| File | Purpose |
|------|---------|
| `ARCHITECTURE.md` | Complete technical architecture guide |
| `AGENTS.md` | AI agent safety rules and modification guide |
| `Deploy.ps1` | Deployment script (must use this, never firebase deploy directly) |
| `deploy.md` | Deployment instructions |
| `public/index.html` | Main app shell |
| `public/sw.js` | Service Worker with asset caching |

## 🚀 Deployment
```powershell
./Deploy.ps1
```

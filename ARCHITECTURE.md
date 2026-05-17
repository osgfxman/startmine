# Startmine — Architecture Guide

Welcome to the **Startmine Architecture Guide**. This document serves as the primary technical blueprint and developer reference for Startmine. Whether you are an AI agent or a human engineer, this guide outlines how the system operates, how data flows, and the critical guardrails you must respect when making modifications.

---

## 1. Overview
Startmine is a high-performance **Progressive Web App (PWA)** built entirely with **Vanilla JavaScript** and **Vanilla CSS**. It operates completely without modern frameworks (like React or Vue) or bundlers (like Webpack or Vite), ensuring instant load times and lightweight execution.

It serves as a dual-purpose **Bookmark & Productivity Hub**, blending:
- **Traditional Dashboard Pages**: Formatted as customizable, multi-column layouts composed of widget blocks (bookmarks, checklists, notes, todos).
- **Miro-like Infinite Canvas Pages**: High-density visual boards containing drag-and-drop sticky notes, shapes, images, videos, text fields, and connector lines.

---

## 2. Tech Stack
- **Core UI & Logic**: Vanilla HTML5, Vanilla CSS3 (custom CSS variables & HSL-tailored dark modes), Vanilla ES6 JavaScript.
- **Database**: Firebase Realtime Database (sharded layout).
- **Authentication**: Firebase Authentication with Google Sign-In.
- **APIs & Integrations**: Google Workspace APIs (Google Calendar, Google Drive, Google Tasks).
- **Hosting**: Firebase Hosting (configured with edge cache header structures).
- **Offline / PWA**: Native Service Worker (`sw.js`) and Web App Manifest (`manifest.json`).

---

## 3. Directory Structure
Here is the actual file layout on the disk:

```
c:\Users\NTRA\OneDrive - NTRA-EG\17May_Startmine\
├── firebase.json              # Firebase Hosting and rewrite configuration rules.
├── .firebaserc                # Firebase project identifier mapping.
├── Deploy.ps1                 # Automated cache-busting versioning and deployment script.
├── deploy.md                  # Workflow instructions for deploying to production.
└── public/                    # Production-ready web assets.
    ├── index.html             # Main application entry point and structural UI layout.
    ├── inbox.html             # Lightweight inbox-capture viewport for fast sharing.
    ├── manifest.json          # Web app manifest for PWA installation & share target.
    ├── sw.js                  # Native service worker for precaching and routing.
    ├── css/
    │   ├── base.css           # Core styling, variables, scrollbars, and widget layout.
    │   └── miro.css           # Canvas-specific styles, selection frame, and sticky notes.
    └── js/
        ├── core/
        │   ├── namespace.js   # Global SM namespace and bridge helper definitions.
        │   └── utils.js       # Global utility functions (uid, esc, cp, fw, mkFav).
        ├── data/
        │   ├── firebase.js    # Firebase initialization, authentication, and SDK configuration.
        │   ├── offline.js     # Cache layer, IndexedDB management, and offline state handling.
        │   └── sync.js        # Two-way real-time data sync, sharding, and save guards.
        ├── ui/
        │   ├── toasts.js      # Toast notifications engine.
        │   ├── modals.js      # Modal windows controller.
        │   ├── toolbar.js     # Sidebar, toolbar, and settings drawer handlers.
        │   ├── search.js      # Global multi-dimensional search index and overlay.
        │   └── inbox-ui.js    # Quick-capture inbox panel builder.
        ├── miro/
        │   ├── miro-state.js  # Miro canvas state variables and coordinate definitions.
        │   ├── render/
        │   │   └── builders.js# Rendering loop and individual Miro card DOM builders.
        │   └── layout/
        │       └── grid.js    # Smart snapping alignment, grids, and collision handlers.
        ├── miro-engine.js     # Miro canvas event loop, drag/zoom gestures, and connectors.
        ├── thumbnails.js      # Thumbnail generator, image loaders, and URL previews.
        ├── outline.js         # Interactive canvas outlines and structure explorer.
        ├── alignment.js       # Group alignment tools and alignment panel overlays.
        └── app.js             # Main application setup, event listeners, and DB initialization.
```

---

## 4. Script Load Order
The following is the exact script loading order defined in `public/index.html`. 

> [!IMPORTANT]
> **Dependencies must load before dependents**. The `app.js` file relies on all other namespaces being fully initialized, and therefore **must always load last**.

1. `js/core/namespace.js` — Declares the `window.SM` namespaces.
2. `js/core/utils.js` — Exposes core helper functions to the global scope.
3. `js/data/firebase.js` — Initializes the Firebase app and auth variables.
4. `js/data/offline.js` — Establishes LocalStorage and IndexedDB caching wrappers.
5. `js/data/sync.js` — Sets up sharded Realtime Database synchronization logic.
6. `js/ui/toasts.js` — Connects toast message triggers.
7. `js/ui/modals.js` — Registers open/close modals handlers.
8. `js/ui/toolbar.js` — Initializes navigation bar controls.
9. `js/ui/search.js` — Installs search index listeners.
10. `js/ui/inbox-ui.js` — Powers the quick inbox lists.
11. `js/miro/miro-state.js` — Pre-seeds canvas states.
12. `js/miro/render/builders.js` — Prepares individual card builder loops.
13. `js/miro/layout/grid.js` — Prepares snap-to-grid grid coordinates.
14. `js/miro-engine.js` — Powers canvas inputs, selection boxes, and zoom logic.
15. `js/thumbnails.js` — Installs URL screenshot tools.
16. `js/app.js` — **Main Entry Point**. Binds authentication and triggers `initDB()`.
17. `js/outline.js` & `js/alignment.js` (Deferred) — Loaded dynamically after first auth paint inside `_loadMainApp()` to optimize page load speeds.

---

## 5. Data Model
Startmine uses a single global state object `D` to hold all user environments, groups, pages, and widgets.

```json
{
  "settings": {
    "engine": "bm",
    "accent": "#6c8fff",
    "defaultGroup": "g0",
    "defaultPage": "p0"
  },
  "curEnv": "e0",
  "curGroup": "g0",
  "environments": [
    { "id": "e0", "name": "Main Env" }
  ],
  "groups": [
    { "id": "g0", "name": "Main Group", "envId": "e0" }
  ],
  "inbox": [],
  "pages": [
    {
      "id": "p0",
      "groupId": "g0",
      "name": "My Canvas Page",
      "pageType": "miro",
      "zoom": 100,
      "panX": 0,
      "panY": 0,
      "bg": "",
      "bgType": "none",
      "miroCards": [
        {
          "id": "c1",
          "type": "sticky",
          "content": "Work task",
          "color": { "r": 255, "g": 235, "b": 156, "a": 1 },
          "x": 200, "y": 150, "w": 120, "h": 120
        }
      ]
    },
    {
      "id": "p1",
      "groupId": "g0",
      "name": "My Widgets Page",
      "pageType": "bookmarks",
      "cols": 3,
      "widgets": [
        {
          "id": "w1",
          "col": 0,
          "type": "bookmarks",
          "title": "Dev Links",
          "emoji": "🔗",
          "items": [
            { "id": "i1", "label": "GitHub", "url": "https://github.com" }
          ]
        }
      ]
    }
  ]
}
```

### Core Concepts:
- **`cp()`**: Helper function that returns the active page object based on `D.cur`.
- **`DEF`**: Standard blueprint template object used to initialize new users or fresh setups.
- **Miro vs. Traditional**:
  - `pageType === 'miro'`: Renders as an infinite 2D canvas using `miroCards`. Traditional `widgets` are ignored on this page.
  - `pageType !== 'miro'` (e.g., `'bookmarks'`): Renders as a standard responsive column layout utilizing `widgets` and traditional items.

---

## 6. Storage Strategy
To achieve absolute speed, data integrity, and offline availability, Startmine utilizes a robust 4-tier sharded storage layer:

| Layer | Storage Mechanism | Purpose | Keys / Paths |
| :--- | :--- | :--- | :--- |
| **Tier 1** | Memory | Instant active runtime state. Extremely fast reads/writes. | Global `D` object |
| **Tier 2** | `localStorage` | Caches metadata and page definitions for immediate first-paint. | `sm_meta`, `sm_pages_meta`, `sm_cur_page` |
| **Tier 3** | `IndexedDB` | Handles large-scale page payloads (such as heavy widgets and canvas contents). | DB: `startmine_cache`, Object Store: `pages`, Keys: `sm_page_<pid>` |
| **Tier 4** | Firebase | Single source of truth. Synced sharded database nodes in the cloud. | `users/{uid}/startmine_meta`<br>`users/{uid}/startmine_pages_meta`<br>`users/{uid}/startmine_pages/{pid}` |

### Save Guards:
- **Incremental Writes**: Startmine only uploads modified properties and pages. Individual page payloads (widgets/miroCards) are saved under sharded paths to avoid rewriting the entire database on every keypress.
- **Data Loss Prevention**: If the database save detector detects an empty payload trying to overwrite non-empty data, the save is rejected, preventing accidental loss.
- **`forceLocalSave()`**: Captures current states and forces immediate writes to `localStorage` and `IndexedDB` on browser triggers (`beforeunload` and `visibilitychange` events).

---

## 7. Offline/Realtime Mode
Startmine defaults to **Offline Mode** to prioritize absolute client-side responsiveness.
- **`toggleOfflineMode()`**: Switches the system between Offline (local caches, changes saved to localStorage/IndexedDB) and Realtime Mode.
- **`syncNow()`**: Actively pulls the latest sharded metadata and page details from Firebase, merges local edits, pushes missing states, and handles conflicts.
- **`setupShardedListeners()`**: Subscribes to real-time changes at `startmine_meta` and `startmine_pages_meta` nodes, ensuring cross-tab live synchronization.

---

## 8. Canvas Engine (Miro)
The infinite canvas rendering is optimized using lightweight DOM manipulation:
- **`buildMiroCanvas()`** (in `builders.js`): Coordinates the canvas rendering cycle. To prevent memory leaks, it maintains a strict canvas loop:
  1. Compares active DOM cards with current `miroCards`.
  2. Spawns/updates modified elements and removes defunct ones.
  3. Uses `buildersMap` containing designated card type builders (`buildMiroSticky`, `buildMiroImage`, `buildMiroShape`, etc.) with secure fallbacks.
- **Recursion Protection (`_buildingCanvas`)**: A locking boolean flag guards against overlapping canvas draws, ensuring layout computations don't trigger maximum call stack loops.
- **Grid Snapping (`updateMiroGrid`)**: Manages the visible dotted canvas layout, translating viewport coordinates dynamically.
- **Gestures (`miro-engine.js`)**: Tracks middle-click pans, touchpad pinch-to-zooms, Alt+Drag duplicating, and multi-selection boxes.

---

## 9. Global Functions Mapping
Startmine registers crucial global callbacks and triggers inline HTML event handlers:

| Function | Defined in | Called from (Context / Element) | Purpose |
| :--- | :--- | :--- | :--- |
| `toggleOfflineMode()` | `offline.js` | `index.html` Offline Mode checkbox (`onchange="toggleOfflineMode()"`) | Switches between offline local mode and live sharded realtime sync. |
| `syncNow()` | `sync.js` | `index.html` Cloud icon button (`onclick="syncNow()"`) | Pulls database and page contents manually. |
| `openSelIO(mode, d)` | `inbox-ui.js` | `index.html` Import/Export button (`onclick="openSelIO('export', D)"`) | Opens the Selective Import/Export dashboard pop-up. |
| `closeSelIO()` | `inbox-ui.js` | `index.html` Import/Export modal close overlay / '✕' close button | Closes the Selective Import/Export dialog layout. |
| `selIOSelectAll(val)` | `inbox-ui.js` | `index.html` Modal selection buttons (`onclick="selIOSelectAll(true/false)"`) | Marks all or none of the checkboxes inside selective IO. |
| `doSelectiveExport()` | `inbox-ui.js` | `index.html` Modal export trigger (`onclick="doSelectiveExport()"`) | Packs and triggers a download of selected pages as a JSON file. |
| `handleSelIOImport(e)`| `inbox-ui.js` | `index.html` Modal file input element (`onchange="handleSelIOImport(event)"`) | Parses the selected JSON file and initiates selective page imports. |
| `doImportFromDrive()` | `inbox-ui.js` | `index.html` Modal Google Drive trigger (`onclick="doImportFromDrive()"`) | Restores backup checkpoints from authorized Drive assets. |
| `createWidgetFromSelection()` | `miro-engine.js` | `index.html` Canvas Widget action handle (`onclick="createWidgetFromSelection()"`) | Creates standard widgets from a selection frame. |
| `closeM(modalId)` | `modals.js` | `index.html` Modal cancel buttons (`onclick="closeM('m-aw')", onclick="closeM('m-bm')", onclick="closeM('m-ren')", onclick="closeM('m-dp')", onclick="closeM('m-col')", onclick="closeM('m-bg')", onclick="closeM('m-settings')"`) | Closes the specified modal popup dialog cleanly. |
| `saveAllBackups()` | `app.js` | `index.html` Shield icon button (`onclick="saveAllBackups()"`) | Encodes database and pushes backups to Firebase, Drive, and GitHub. |
| `performUndo()` | `miro-engine.js` | `index.html` Undo SVG icon button (`onclick="performUndo()"`) | Reverts the last recorded canvas edit action. |
| `openSnapshotModal()`| `app.js` | `index.html` Camera icon button (`onclick="openSnapshotModal()"`) | Views historical database snapshot logs. |
| `unpinAll()` | `miro-engine.js` | `index.html` Pin icon button (`onclick="if(typeof unpinAll==='function')unpinAll()"`) | Unpins all coordinates and items from their lock constraints. |
| `setActiveTool(tool)`| `miro-engine.js` | `miro-engine.js` Toolbar click event bindings | Selects active canvas mode ('select', 'sticky', 'text', 'pen', etc.). |

---

## 10. Deployment Workflow
Deployment to production is completely automated. **Direct deployment via simple `firebase deploy` is strictly forbidden** as it bypasses version incrementation and service worker cache-busting.

### How to Deploy:
1. Run `./Deploy.ps1` in PowerShell.
2. The script automatically:
   - Obtains a Unix timestamp.
   - Updates the version parameter `?v=TIMESTAMP` across all CSS/JS references in `public/index.html` and `public/sw.js`.
   - Modifies `CACHE_NAME` inside `sw.js` to trigger automatic service worker cache eviction on the clients' devices.
   - Deploys the code to Firebase Hosting via the Firebase CLI.

---

## 11. PWA / Service Worker Caching Strategies
The Service Worker (`public/sw.js`) customizes network fetching based on asset classifications:
- **Firebase / APIs**: Completely skipped to prevent caching database updates or Google API requests.
- **Google Fonts & CDN Scripts**: Cache-First. Fetched once and served directly from cache to guarantee instantaneous offline launches.
- **Local CSS & JS Modules**: Network-First. Always tries to fetch the latest module from the network to ensure instant updates, falling back to cached modules if offline.
- **Root `/` & `/inbox`**: Intercepted and routed to cached `index.html` or `inbox.html` layouts when network connections are unavailable.

---

## 12. Key Safety Rules for AI/Developers
When modifying Startmine, you must strictly follow these rules to avoid breaking changes and regressions:

> [!WARNING]
> **Data Preservation Guardrail**: Never delete or overwrite data without confirming that local caches or Google backup files are healthy. 

> [!CAUTION]
> **Infinite Recursion / Bridge Guardrail**: Never create top-level global function declarations in `app.js` that share names with functions declared in modular JS files (`search.js`, `toolbar.js`, `inbox-ui.js`). Because global function declarations attach directly to `window`, they will override the modules, leading to fatal recursion crashes. Always call cross-module functions using `window[fnName](...arguments)` wrappers if you need to reference them safely before initialization.

- **Checklist Testing**: Always test the entire application checklist (Miro infinite canvas pan/zoom, traditional widget creation, offline toggling, and selective backup restorations) after making a code change.
- **Maintain Script Load Order**: Do not reorder the scripts in `index.html`.
- **Precache Registry**: If you add any new CSS or JS file, remember to register it inside the `STATIC_ASSETS` array in `public/sw.js` to ensure proper offline caching.
- **Deployment**: Always use `./Deploy.ps1` for all deployments.

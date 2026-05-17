⚠️ FIRST: Read ARCHITECTURE.md completely before making ANY changes.

# Startmine — AI Agent Guide

## Before You Start
1. Read ARCHITECTURE.md first for full project understanding
2. Read the @module header at the top of any file before modifying it
3. Never modify a file without understanding its @depends and @provides

## How to Add a New Feature
1. Identify which layer it belongs to: core / data / ui / miro
2. Create a new file in the appropriate directory
3. Add @module header with all fields
4. Register functions on both SM.namespace and window
5. Add script tag in index.html (respect load order!)
6. Add file to sw.js STATIC_ASSETS
7. Run SM.core.runHealthCheck() mentally: will your changes break any check?

## How to Modify an Existing Feature
1. Read the @module header of the file
2. Check @depends: do not remove or rename anything these files expect
3. Check @provides: do not remove or rename any exported function
4. If you move a function to another file:
   - Keep window alias in the old file OR
   - Delete from old file ONLY if you confirm no other file calls it by the old path
   - NEVER use: function X() { return window.X(...arguments); }
     This pattern causes infinite recursion because function declarations override window.X

## Forbidden Patterns
1. function X() { return window.X(...arguments); }  → INFINITE RECURSION
2. Deleting data before confirming new data is ready → DATA LOSS
3. Calling buildMiroCanvas() inside a card builder → INFINITE RECURSION
4. Adding script tags after app.js in index.html → WILL NOT WORK (app.js must be last)
5. Changing ?v= manually → USE Deploy.ps1 ONLY
6. Direct firebase deploy → USE Deploy.ps1 ONLY

## Testing After Changes
Run this mental checklist:
- Does SM.core.runHealthCheck() still pass?
- Did you update sw.js STATIC_ASSETS?
- Did you maintain script load order in index.html?
- Are all window aliases preserved for HTML inline handlers?

## Module Communication
- Direct calls: OK for parent→child (e.g., app.js calls sync.js)
- SM.events: Use for sibling→sibling or child→parent notifications
- Never create circular dependencies between modules

## File Naming Convention
- core/: Infrastructure (namespace, utils, events, health)
- data/: Firebase, sync, offline, caching
- ui/: User interface components
- miro/: Canvas engine (state, render, layout)

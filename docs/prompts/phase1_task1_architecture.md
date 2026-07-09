You are the lead architect for a Tauri v2 desktop application. Read
docs/Desktop_Pet_PRD_Technical_Spec.md (Sections 2-3) and
docs/Desktop_Pet_IPC_and_Database_Reference.md (Section 9) before doing anything else.

Create the following actual files and folders in this project (use real file system
operations, not just a description):

1. The full folder structure:
   src-tauri/src/{main.rs, db.rs, events.rs}
   src-tauri/src/commands/{tasks.rs, notes.rs, alarms.rs, window.rs}
   src/{main.tsx}
   src/pet-window/{index.tsx, canvas-renderer.ts, animation-state.ts}
   src/utility-window/{index.tsx, TaskList.tsx, NotesEditor.tsx, AlarmModal.tsx, Settings.tsx}
   src/shared/{ipc-client.ts, types.ts, hooks.ts}
   src/styles/{globals.css, variables.css}
   src/assets/sprites/
   
   Create each file as an empty stub with a one-line comment describing its purpose —
   do not implement logic yet, that comes in Phase 2.

2. Initialize package.json with dependencies: react, react-dom, @tauri-apps/api,
   typescript, vite, @vitejs/plugin-react

3. Write docs/architecture-plan.md documenting:
   - Confirmed tech stack and why
   - The dependency list organized by which Milestone needs it (M1/M2/M3)
   - Critical implementation notes: Rust backend is sole state writer, IPC contract
     lives in Desktop_Pet_IPC_and_Database_Reference.md and must not be deviated from

Run `git status` at the end and show me what was created.
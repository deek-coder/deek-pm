---
name: deek-pm
description: Use when working on the Deek PM desktop project, including product information architecture, workspace design, Vite/React prototype updates, requirements, data model drafts, Electron technical planning, local backup, service-side workspace, and repository abstraction decisions.
---

# Deek PM

Use this skill for Deek PM product, prototype, requirements, data model, and Electron architecture work.

## Read Order

Read only what is needed:

- Product rules: `D:\ownProgram\deek-pm\.agents\.frame\product.md`
- Requirements: `D:\ownProgram\deek-pm\.agents\.feature\requirements.md`
- Data model draft: `D:\ownProgram\deek-pm\.agents\.feature\data-model.md`
- Electron technical plan: `D:\ownProgram\deek-pm\.agents\.feature\electron-tech-plan.md`
- Prototype app: `D:\ownProgram\deek-pm\.agents\.prototype`

## Core Rules

- Treat workspace as an instance, not just a type.
- Model local as one fixed personal workspace.
- Model official cloud and self-hosted deployments as service-side workspaces.
- Do not put local/cloud switching in the top-right as a casual toggle.
- After entering a workspace, keep navigation scoped to that workspace.
- Hide members and invitations for local workspace.
- Show members, roles, invitations, permissions, and audit concepts for service-side workspaces.
- Use Repository interfaces so UI does not care whether data is local or service-side.

## Prototype Rules

When editing the prototype:

- Keep it simple and comfortable.
- Use the existing Vite + React app in `.agents\.prototype`.
- Preserve the multi-tab desktop style.
- Keep startup flow as workspace selection first.
- Prefer refining existing screens over adding many new pages.
- For the formal app UI stack, prefer TypeScript, Tailwind CSS, shadcn/ui, Radix UI, lucide-react, TanStack Query, TanStack Table, react-hook-form, zod, TipTap, and Zustand.
- Use TanStack Router for routing.
- Use SQLite for local persistence.
- Treat local database encryption as required by default.
- Use SQLCipher for SQLite full-database encryption.
- Store service tokens with Electron safeStorage in the first version.
- Treat self-hosted licensing as out of scope for the first version.
- Save file/folder/URL references only in the first version; do not copy attachment bodies.
- Reserve audit log models for service-side workspaces, but do not require full audit UI in the first version.
- Use mock service APIs before the real server is ready.
- Use local in-memory mock Repository first, not MSW by default.
- Store rich text as TipTap JSON and support Markdown import/export later.
- Apply field-level encryption to password values in addition to SQLCipher.
- Require a local vault master password, with optional remember-on-this-device behavior.
- Keep project list flat in the first version; support directory trees inside Knowledge.
- Reserve password entry permissions and audit actions without requiring full UI in the first version.
- Follow mature engineering practices: TypeScript-first, layered architecture, mock-first development, secure defaults, tests for sensitive data paths, and synchronized docs.
- Avoid making Deek PM feel like a generic Ant Design admin dashboard unless the user explicitly asks for Ant Design.

# SprintLab knowledge/

Developer-only source documents for SprintLab Coach's Gemini File Search store. Not part of
the shipped app — nothing here is bundled or referenced by client/native code.

## What goes here

The current, finalized SprintLab training documents — most importantly the Season Engine
specification and any other authoritative planning/research documents you want Gemini to be
able to retrieve. If a document has multiple versions, only place the newest/final one here;
`npm run knowledge:upload` treats every file present as current and authoritative, so remove
superseded drafts rather than leaving them alongside the final version.

Do not put unrelated project files here — only the specific documents meant to inform
SprintLab Coach.

## Commands

- `npm run knowledge:upload` — uploads every file in this folder into SprintLab's single
  persistent Gemini File Search store. Safe to re-run: reuses the existing store (never
  creates a duplicate) and skips files already uploaded. Pass `--refresh` to force
  re-uploading everything (e.g. after editing a document in place).
- `npm run knowledge:test -- "your question"` — asks Gemini a question using File Search
  retrieval against the store, for verifying retrieval quality. Not connected to `/api/coach`.

## Note

See `SPRINTLAB_AI_CONTEXT.md` (project root) for how these documents should be weighted by
the AI relative to SprintLab's existing deterministic planner — evidence and baseline
knowledge, not an inflexible rulebook.

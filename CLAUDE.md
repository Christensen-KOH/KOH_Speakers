## Auto-deploy
- Whenever a coding task is finished and `npm run build` succeeds with zero errors, automatically run `git add -A && git commit -m '<concise summary>' && git push origin main` so Netlify auto-deploys the update.

## Delegation (every multi-step task)
- Codebase scanning (finding files, tracing usages, summarising how a system is set up) → delegate to the `gemini-cli` MCP server (`ask-gemini`). Ask for file paths, line numbers and a short summary, not file dumps.
- Bulk JSON/content generation (e.g. `data/maps/*.json`, manifests, question banks) → delegate to `gemini-cli`; spot-check the result against the schema (`src/map/MapDtoSchema.ts` for maps) before writing it to disk.
- Logic/architecture review of a planned or finished change → delegate to the `rea` MCP server.
- Reserve Claude's own context strictly for surgical file edits and the single end-of-task `npm run build`.
- Single-step tasks (one edit, one question) need no delegation.
- If `gemini-cli` or `rea` is not connected or errors out, say so in one line and do that part directly rather than stalling.

## Gimkit Snowbrawl adaptation
- Follow [GIMKIT_TANK_SPEC.md](GIMKIT_TANK_SPEC.md) for all gameplay, HUD, controls and co-op work (HP/Shield, no auto-popping question modal, on-map stations, host authority).
- Do NOT run `npm test` and do NOT scan unrelated files.

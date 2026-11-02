## Auto-deploy
- Whenever a coding task is finished and `npm run build` succeeds with zero errors, automatically run `git add -A && git commit -m '<concise summary>' && git push origin main` so Netlify auto-deploys the update.

## Gimkit Snowbrawl adaptation
- Follow [GIMKIT_TANK_SPEC.md](GIMKIT_TANK_SPEC.md) for all gameplay, HUD, controls and co-op work (HP/Shield, no auto-popping question modal, on-map stations, host authority).
- Do NOT run `npm test` and do NOT scan unrelated files.

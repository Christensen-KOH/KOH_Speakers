## Auto-deploy
- Whenever a coding task is finished and `npm run build` succeeds with zero errors, automatically run `git add -A && git commit -m '<concise summary>' && git push origin main` so Netlify auto-deploys the update.

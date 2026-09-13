# AiMar web app

See the repository `README.md` for usage and `ARCHITECTURE.md` for structure.

```bash
npm install
npm run dev          # dev server with service worker
npm run build        # tsc + vite build → dist/
npm run preview      # serve dist/ on :4173
npm run fetch-data   # refresh public/data snapshot
npm test             # vitest unit tests
npm run smoke        # headless-Chrome e2e against :4173
npm run lint
```

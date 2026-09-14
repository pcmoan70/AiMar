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

## Login gate

The site asks for a username and password before showing the map. Only a
salted PBKDF2 hash ships in `src/lib/auth-config.ts`; regenerate it after
changing `AIMAR_LOGIN_USER` / `AIMAR_LOGIN_PASSWORD` in `.env.local`:

```bash
node -e "
const fs=require('fs'),c=require('crypto');
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const salt='aimar-login-v1',iter=150000;
const hash=c.pbkdf2Sync(env.AIMAR_LOGIN_USER.toLowerCase()+':'+env.AIMAR_LOGIN_PASSWORD,salt,iter,32,'sha256').toString('hex');
fs.writeFileSync('src/lib/auth-config.ts','export const AUTH_SALT = \''+salt+'\'\nexport const AUTH_ITERATIONS = '+iter+'\nexport const AUTH_HASH = \''+hash+'\'\n')"
```

This is a gate against casual visitors, not real access control: a static site
cannot stop anyone from fetching its data files directly.

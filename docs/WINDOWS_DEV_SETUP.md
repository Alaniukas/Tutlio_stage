# Running the project commands on Windows (PowerShell)

Written 2026-09-05 after a session of "command not recognized" errors. Everything below was verified on a Windows 11 machine with Node 22.

## 1. Why `npm` and `npx` fail in PowerShell

Node installs three launchers per command: `npm.cmd`, `npm.ps1` and `npm`. PowerShell prefers the `.ps1` one, and the default execution policy refuses to run it:

```
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled
```

Pick one fix:

- **Once, permanently (recommended):** in PowerShell run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. It only affects your user, allows locally created scripts, and still blocks unsigned scripts downloaded from the internet. After that `npm` and `npx` work normally.
- **Without changing policy:** always type `npm.cmd` and `npx.cmd` instead of `npm` and `npx`. Note there is no space: `npx.cmd vercel link`, not `npx. cmd vercel link`.
- **Or use a different shell:** Command Prompt or Git Bash are not affected.

## 2. Why `vercel` and `supabase` are "not recognized"

Neither CLI is installed globally.

- `vercel` is a project devDependency. Run it through npx (`npx.cmd vercel login`) or through the package scripts (`npm.cmd run vercel:link-tutlio`), which put `node_modules\.bin` on the PATH automatically.
- `supabase` is not a dependency at all; the project always calls `npx supabase …`. The first run asks to install it, answer `y`.
- If you want the bare commands everywhere: `npm.cmd install -g vercel supabase`.

## 3. Log in with the right accounts

Logging in is not enough; the account has to own the production project.

```
npx.cmd vercel login
npx.cmd vercel teams ls          # must list alaniukas-projects, the team that owns the tutlio project
npx.cmd supabase login
npx.cmd supabase projects list   # must list cuhciqwmqfuajeeqjjbm (Korepkėms)
```

If `alaniukas-projects` is missing, `vercel link` and `vercel deploy` will say "The specified scope does not exist" or "Your codebase isn't linked to a project" no matter what you type. Ask Alanas to add you to that team (Vercel → Team settings → Members) and to the Supabase organisation.

## 4. Day-to-day commands that work on Windows

```
npm.cmd install
npm.cmd run dev                      # Vite on :3000 plus the local API on :3002; .env.local is loaded by scripts/dev-api-local.ts
npm.cmd test -- tests/api/esm-import-extensions.test.ts
npm.cmd run verify:api-esm           # runtime proof that every API function loads as Node ESM
npm.cmd run seo:smoke                # against the live domains, after a deploy
```

`npm run dev:prod` and `npm run dev:test` start with `zsh -ac` and only work on macOS or Linux. On Windows use `npm run dev` with the right values already in `.env.local`.

## 5. Deploying

Production deploys upload the current directory, not git HEAD. Deploy from a checkout of `main` with no uncommitted changes, with a Vercel login that belongs to `alaniukas-projects`:

```
npm.cmd test -- tests/api/esm-import-extensions.test.ts
npm.cmd run verify:api-esm
npm.cmd run vercel:deploy-prod
npm.cmd run seo:smoke
```

Database migrations: production's migration history has drifted from `supabase/migrations`, so run `npx.cmd supabase db push --dry-run` first and apply single migrations through `npx supabase db query --linked --project-ref cuhciqwmqfuajeeqjjbm -f <file.sql>` or the dashboard SQL editor when the dry run lists more than the file you intend to apply. See `docs/seo-post-deploy-ops.md` for the full post-deploy checklist.

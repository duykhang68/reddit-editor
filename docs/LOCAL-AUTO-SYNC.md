# GitHub → Local auto-sync (Windows / macOS / Linux)

`npm run dev` now starts the Editor **and** a safe Git polling loop for the **currently checked-out branch**. It does not require a GitHub webhook, PAT, or a publicly exposed port on your computer.

## One-time setup after this change is merged

Run in a terminal **inside your local clone** (not an unrelated project copy):

```bash
git rev-parse --show-toplevel
git remote -v
git switch main
git pull --ff-only
npm ci
npm run dev
```

The `origin` URL must point to `https://github.com/duykhang68/tetdinhmuiblog.git` (SSH is also fine). Your `main` branch should track `origin/main`; if `git branch -vv` shows no upstream, run `git branch --set-upstream-to=origin/main main` once. On another work branch, set its appropriate upstream and start `npm run dev` from that branch.

Editor: **http://localhost:5173**. If the Blogger backend is configured, keep `apps/server/.env` in place; it is never overwritten by this sync process.

## How it works

1. Every **20 seconds** (`LOCAL_SYNC_INTERVAL_MS` to override, between 5000 and 300000 ms), fetch the configured remote for the currently checked-out branch.
2. Fast-forward to its upstream only if the working tree is clean and the remote commit is a descendant. **Never** use `git reset --hard`, force-pull, rebase or auto-stash. If there are uncommitted/untracked files, a divergent branch, or an unavailable network, keep the Editor running and report why the sync was skipped.
3. Detect commits applied by another terminal (`git pull`, merge, etc.) as well, without performing a second pull.
4. React/Vite source-only updates: keep the dev process running; Vite HMR refreshes the browser. Node's `--watch` refreshes the backend. Changes to `package.json` / `package-lock.json`: stop the dev process, run `npm ci`, then start it again. Updates to Vite config or dev launcher restart the dev process without reinstalling. Creating/removing `apps/server/.env` also restarts to pick up backend mode.
5. If dev exits unexpectedly, retry on the next poll. Stop the whole system with **Ctrl+C**.

A new feature merged **to `main`** becomes visible in a local **`main`** checkout after the next successful poll. While working on another branch, only commits pushed to that branch's upstream are synchronized; this intentionally avoids merging `main` into unfinished feature work. Switching branches requires restarting `npm run dev`.

## Commands

| Command | Behavior |
| --- | --- |
| `npm run dev` | Auto-sync + Editor (default) |
| `npm run dev:sync` | Same as `npm run dev` |
| `npm run dev:local` | Editor only, **no automatic Git changes** |
| `npm run check` | Syntax + tests, including the sync helper |

**Optional Windows sign-in auto-start:** create a shortcut to `scripts\start-local-sync.cmd` in the Startup folder (`Win + R` → `shell:startup`). This is opt-in; the project never modifies your Windows startup settings automatically. Keep only one instance running per local checkout.

In PowerShell, for faster polling during development:

```powershell
$env:LOCAL_SYNC_INTERVAL_MS = '10000'
npm run dev
```

The machine must be on and the process running; a GitHub-hosted Action cannot directly restart an arbitrary local computer. Cloudflare Pages deployment is a separate process and is not a substitute for the local watcher.

## Troubleshooting

- **Dirty working tree:** `git status --short` and commit, stash manually, or clean up before resuming (the script never discards your work).
- **No upstream:** check `git branch -vv` and use `git branch --set-upstream-to=origin/main main` while on `main`.
- **Divergence:** resolve the branch manually; the script will not overwrite commits or force-merge.
- **Offline / fetch error:** the Editor continues running and retries when the connection returns.
- **Port 5173 already used:** close other `npm run dev` instances and retry.
- **Need to work offline:** choose `npm run dev:local`.
- **Code on another path:** `git rev-parse --show-toplevel` must be the directory containing this repository's `package.json`; changes in one clone do not automatically copy to a different untracked folder.

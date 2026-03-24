# /dev-start — Start the local development environment

Start (or restart) the Votiverse local dev environment. Handles git sync, dependency installation, database resets, server startup, and health verification.

## Arguments

The user may pass one of these after `/dev-start`:
- **(no args)** — Smart start: pull latest, install if needed, detect if reset needed, start servers.
- **`reset`** — Force a full database reset (VCP + backend), then start servers.
- **`stop`** — Kill all dev servers and exit.
- **`status`** — Show what's currently running on dev ports and exit.
- **`quick`** — Skip git/install checks, just start servers.

## Port assignments

| Service | Port | Health endpoint |
|---------|------|-----------------|
| VCP     | 3000 | `http://localhost:3000/health` |
| Backend | 4000 | `http://localhost:4000/health` |
| Web     | 5173 | `http://localhost:5173` (or 5174 if 5173 was occupied) |

## Execution steps

Follow these steps in order. Skip sections that don't apply based on the argument.

### 0. Pre-flight: show current status

Run this first regardless of argument:
```bash
lsof -i :3000 -i :4000 -i :5173 -i :5174 -P 2>/dev/null | grep LISTEN
```
Report which servers are already running. If the argument is `status`, stop here.

### 1. Kill existing servers (all modes except `status`)

Kill any processes on ports 3000, 4000, 5173, 5174:
```bash
for port in 3000 4000 5173 5174; do
  pid=$(lsof -ti :$port 2>/dev/null)
  if [ -n "$pid" ]; then
    kill $pid 2>/dev/null
    echo "Killed PID $pid on port $port"
  fi
done
```
Wait 2 seconds, then verify ports are free. If any are still occupied, use `kill -9`.

If the argument is `stop`, report success and stop here.

### 2. Check PostgreSQL (skip for `quick` and `stop`)

Verify PostgreSQL is running before doing anything database-related:
```bash
pg_isready -q 2>/dev/null
```
If not running, tell the user: "PostgreSQL is not running. Start it with `brew services start postgresql@17` (or your local method) and re-run `/dev-start`." Stop here.

### 3. Git sync (skip for `quick`)

```bash
cd /Users/claude/projects/votiverse
git status --short
git branch --show-current
git fetch origin
```

Determine the tracking branch. If on `main`, check against `origin/main`. If on a feature branch, check against its upstream:
```bash
git rev-list --count HEAD..@{upstream} 2>/dev/null
```

**Decision tree:**
- If there are uncommitted changes AND remote is ahead: warn the user. Ask if they want to stash, commit, or abort. Do NOT force-pull or discard changes.
- If there are uncommitted changes but remote is up-to-date: proceed without pulling. Note the uncommitted changes.
- If clean and remote is ahead: `git pull` (fast-forward).
- If clean and up-to-date: proceed.

### 4. Dependency check (skip for `quick`)

Check if dependencies need installing:
```bash
git diff HEAD@{1}..HEAD --name-only 2>/dev/null | grep -q 'pnpm-lock.yaml'
```
Also check if `node_modules` is missing in key locations:
```bash
[ -d node_modules ] && [ -d platform/vcp/node_modules ] && [ -d platform/backend/node_modules ] && [ -d platform/web/node_modules ]
```
If lockfile changed or any `node_modules` is missing, run:
```bash
pnpm install
```

### 5. Detect if reset is needed (skip for `quick`)

A reset is needed if:
- The argument is `reset`
- Migration files changed since last pull: `git diff HEAD@{1}..HEAD --name-only 2>/dev/null | grep -q 'migrations/'`
- The VCP database doesn't exist or is empty (check PostgreSQL: `psql -d votiverse_vcp -c "SELECT 1 FROM assemblies LIMIT 1" 2>/dev/null`)
- The backend database doesn't exist or is empty

If a reset is needed, tell the user why and proceed. Always reset both VCP and backend together — never one without the other. The backend caches (assemblies_cache, topics_cache, surveys_cache) are DB-backed and get wiped during reset.

### 6. Reset databases (if needed)

**Important:** VCP reset is self-contained (starts its own server, seeds, stops). Backend reset requires a running VCP.

```bash
# Step A: Reset VCP (self-contained)
cd /Users/claude/projects/votiverse/platform/vcp && pnpm reset
```
Wait for it to complete. Check exit code. If it fails, report the error and stop.

```bash
# Step B: Start VCP for backend reset
cd /Users/claude/projects/votiverse/platform/vcp && pnpm dev &
VCP_PID=$!
```
Wait for VCP health: poll `http://localhost:3000/health` every 1s for up to 30s.

```bash
# Step C: Reset backend (needs running VCP)
cd /Users/claude/projects/votiverse/platform/backend && pnpm reset
```
Wait for completion.

```bash
# Step D: Kill the temporary VCP
kill $VCP_PID 2>/dev/null
```

### 7. Clear Vite cache (if reset was performed)

After a reset, clear the Vite module cache to avoid stale transforms:
```bash
rm -rf /Users/claude/projects/votiverse/platform/web/node_modules/.vite
```

### 8. Start servers

Start all three servers. Use the Bash tool with `run_in_background: true` for each, or start them as background processes.

**Start order:** VCP first, then backend (it connects to VCP), then web.

```bash
# Terminal 1: VCP
cd /Users/claude/projects/votiverse/platform/vcp && pnpm dev
```

```bash
# Terminal 2: Backend
cd /Users/claude/projects/votiverse/platform/backend && pnpm dev
```

```bash
# Terminal 3: Web
cd /Users/claude/projects/votiverse/platform/web && pnpm dev
```

### 9. Health check

After starting, verify each server is responding:

```bash
# Wait for VCP
for i in $(seq 1 30); do
  curl -sf http://localhost:3000/health > /dev/null 2>&1 && break
  sleep 1
done

# Wait for Backend
for i in $(seq 1 30); do
  curl -sf http://localhost:4000/health > /dev/null 2>&1 && break
  sleep 1
done

# Wait for Web (check if port is listening)
for i in $(seq 1 15); do
  lsof -ti :5173 > /dev/null 2>&1 && break
  lsof -ti :5174 > /dev/null 2>&1 && break
  sleep 1
done
```

### 10. Report

Print a summary:
```
Dev environment ready:
  VCP:     http://localhost:3000  ✓
  Backend: http://localhost:4000  ✓
  Web:     http://localhost:5173  ✓

  Git: [branch] [commit hash] [clean/dirty]
  DB:  [PostgreSQL/SQLite] [reset: yes/no]
```

If any health check failed, report which server is down and suggest troubleshooting steps.

## Error handling

- **PostgreSQL not running:** If `psql` commands fail with "connection refused", tell the user to start PostgreSQL (`brew services start postgresql@17` or their local method).
- **Port still occupied after kill:** Use `kill -9` as fallback. If still stuck, report the PID and process name.
- **VCP reset fails:** Check if PostgreSQL databases exist. The reset script creates them, but the PostgreSQL server must be running.
- **Backend reset fails with ECONNREFUSED:** VCP isn't running. The reset flow above handles this by starting VCP first.
- **pnpm install fails:** Report the error. Common fix: `pnpm store prune` then retry.

## Important notes

- NEVER run `pnpm reset` for backend without a running VCP — it will fail with ECONNREFUSED.
- Always reset both VCP and backend together. A VCP reset changes all UUIDs, making the backend's cached data and user-participant mappings invalid.
- The web UI has no database — it never needs resetting. But clear its Vite cache if you see stale transforms: `rm -rf platform/web/node_modules/.vite`
- PostgreSQL is the preferred dev database. Check `.env` files for connection strings.
- The VCP dev server uses `--conditions source` to resolve engine imports from TypeScript source. No need to rebuild `dist/` for local dev.

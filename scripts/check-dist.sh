#!/usr/bin/env bash
# Check for stale dist/ folders in engine packages.
# Exits 0 if all up to date, 1 if any are stale.
# Usage: ./scripts/check-dist.sh [--rebuild]

set -euo pipefail

STALE=()

for pkg in packages/*/; do
  [ -d "$pkg/src" ] || continue
  [ -d "$pkg/dist" ] || { STALE+=("$pkg (no dist/)"); continue; }

  # Newest source file
  src_newest=$(find "$pkg/src" -type f -name '*.ts' -newer "$pkg/dist/index.js" 2>/dev/null | head -1)
  if [ -n "$src_newest" ]; then
    STALE+=("$pkg")
  fi
done

if [ ${#STALE[@]} -eq 0 ]; then
  echo "All dist/ folders are up to date."
  exit 0
fi

echo "Stale dist/ detected in ${#STALE[@]} package(s):"
for pkg in "${STALE[@]}"; do
  echo "  - $pkg"
done

if [ "${1:-}" = "--rebuild" ]; then
  echo ""
  echo "Rebuilding all engine packages..."
  pnpm --filter @votiverse/core build && \
  pnpm --filter @votiverse/config build && \
  pnpm --filter @votiverse/identity build && \
  pnpm --filter @votiverse/delegation build && \
  pnpm --filter @votiverse/voting build && \
  pnpm --filter @votiverse/survey build && \
  pnpm --filter @votiverse/prediction build && \
  pnpm --filter @votiverse/engine build
  echo "Done."
else
  echo ""
  echo "Run with --rebuild to fix, or: pnpm -r --filter './packages/*' build"
  exit 1
fi

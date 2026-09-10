#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# macOS defaults new shells (especially non-interactive ones, e.g. VS Code
# tasks) to a 256 file-descriptor soft limit. Running 4 file watchers in
# parallel (Nuxt/Vite + 3x tsx watch) easily blows past that and dev fails
# with "EMFILE: too many open files, watch". Raise it for this process tree
# regardless of what the parent shell/profile set.
ulimit -n 65536 2>/dev/null || true

exec pnpm --parallel \
  --filter @mailpocket/smtp \
  --filter @mailpocket/workers \
  --filter @mailpocket/api \
  --filter @mailpocket/web \
  dev

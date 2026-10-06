#!/usr/bin/env bash
# Reproduce a Next.js project's install, lint, build and test run on a clean
# machine and write everything to reports/<timestamp>/ so the numbers in the
# audit report can be checked by anyone.
#
# Usage: scripts/audit.sh /path/to/project [bun|pnpm|npm|yarn]
set -u
PROJECT="${1:?project path required}"
PM="${2:-}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$(pwd)/reports/$STAMP"
mkdir -p "$OUT"

cd "$PROJECT"

detect_pm() {
  if [ -n "$PM" ]; then echo "$PM"; return; fi
  [ -f bun.lockb ] || [ -f bun.lock ] && { echo bun; return; }
  [ -f pnpm-lock.yaml ] && { echo pnpm; return; }
  [ -f yarn.lock ] && { echo yarn; return; }
  echo npm
}
PM="$(detect_pm)"

{
  echo "project: $PROJECT"
  echo "package manager: $PM"
  echo "node: $(node -v 2>/dev/null || echo missing)"
  echo "bun: $(bun -v 2>/dev/null || echo missing)"
  echo "git: $(git rev-parse --short HEAD 2>/dev/null || echo 'not a git checkout')"
  echo "date: $STAMP"
  echo
  echo "lockfiles:"; ls -1 package-lock.json pnpm-lock.yaml yarn.lock bun.lock bun.lockb 2>/dev/null || true
  echo
  echo "scripts:"; node -e 'const p=require("./package.json");for(const [k,v] of Object.entries(p.scripts||{}))console.log("  "+k+": "+v)'
  echo
  echo "runtime hints:"
  grep -n "bun\|node" package.json | grep -i "start\|serve" || echo "  none in package.json start script"
  ls -1 Dockerfile* 2>/dev/null || true
} > "$OUT/environment.txt"

run() { # name, command...
  local name="$1"; shift
  echo "== $name: $*" | tee -a "$OUT/summary.txt"
  local start=$(date +%s)
  "$@" > "$OUT/$name.log" 2>&1
  local code=$?
  local end=$(date +%s)
  echo "   exit=$code time=$((end-start))s" | tee -a "$OUT/summary.txt"
  return $code
}

case "$PM" in
  bun)  run install bun install --frozen-lockfile ;;
  pnpm) run install pnpm install --frozen-lockfile ;;
  yarn) run install yarn install --frozen-lockfile ;;
  *)    run install npm ci ;;
esac

has_script() { node -e 'process.exit(require("./package.json").scripts?.["'"$1"'"]?0:1)'; }

has_script lint  && run lint  "$PM" run lint  || echo "== lint: no script" | tee -a "$OUT/summary.txt"
has_script build && run build "$PM" run build || echo "== build: no script" | tee -a "$OUT/summary.txt"

if has_script test; then
  run test "$PM" run test
  # Pull a test count out of vitest/jest output for the summary.
  grep -E "Tests?:?\s+[0-9]+ passed|[0-9]+ passed|[0-9]+ failed|[0-9]+ skipped" "$OUT/test.log" | tail -5 | tee -a "$OUT/summary.txt"
else
  echo "== test: no script" | tee -a "$OUT/summary.txt"
fi

if [ -f prisma/schema.prisma ]; then
  run prisma-validate npx prisma validate
  grep -n "provider" prisma/schema.prisma | tee -a "$OUT/summary.txt"
fi

# Secrets hygiene: tracked env files and obvious keys in the working tree.
{
  echo "tracked env files:"; git ls-files 2>/dev/null | grep -E '(^|/)\.env' || echo "  none"
  echo "env files in history:"; git log --all --diff-filter=A --name-only --pretty=format: 2>/dev/null | grep -E '(^|/)\.env' | sort -u || echo "  none (or not a git checkout)"
  echo "database files tracked:"; git ls-files 2>/dev/null | grep -E '\.(db|sqlite|sqlite3)$' || echo "  none"
  echo "possible hardcoded secrets:"; grep -rnE "(whatsapp|meta|graph)[^\n]{0,40}(token|secret)\s*[:=]\s*['\"][A-Za-z0-9_-]{16,}" --include=*.ts --include=*.tsx --include=*.js . 2>/dev/null | grep -v node_modules | head -20 || echo "  none found by pattern"
} > "$OUT/secrets.txt"

echo
echo "Reports written to $OUT"
cat "$OUT/summary.txt"

#!/usr/bin/env bash
# scripts/check.sh — Run typecheck + tests + build
# Usage: bash scripts/check.sh

set -euo pipefail

echo "=== TypeScript check ==="
bunx tsc --noEmit

echo ""
echo "=== Tests ==="
bunx vitest run

echo ""
echo "=== Build ==="
bun run build

echo ""
echo "All checks passed."

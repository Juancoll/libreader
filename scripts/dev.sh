#!/usr/bin/env bash
# scripts/dev.sh — Start dev server with host access
# Usage: bash scripts/dev.sh

set -euo pipefail

bun run dev --host

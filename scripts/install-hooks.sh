#!/usr/bin/env bash
#
# Install PatentForge git hooks.
# Run once after cloning: bash scripts/install-hooks.sh
#

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_SRC="$ROOT/scripts/hooks"
HOOKS_DST="$ROOT/.git/hooks"

if [ ! -d "$ROOT/.git" ]; then
    echo -e "${RED}Error: Not a git repository. Run this from the patentforge root.${NC}"
    exit 1
fi

echo "Installing PatentForge git hooks..."

for hook in "$HOOKS_SRC"/*; do
    name=$(basename "$hook")
    cp "$hook" "$HOOKS_DST/$name"
    chmod +x "$HOOKS_DST/$name"
    echo -e "  ${GREEN}Installed${NC} $name"
done

echo ""
echo -e "${GREEN}Done.${NC} Hooks installed to .git/hooks/"
echo "The pre-push hook will run verify-release.sh before every push."
echo "Bypass with SKIP_VERIFY=1 git push (emergencies only)."

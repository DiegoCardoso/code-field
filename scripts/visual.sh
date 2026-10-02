#!/bin/bash
# Runs the visual tests (SPEC §14.2) inside the pinned Playwright container, the only
# renderer the baselines are valid for. Mirrors vaadin/web-components'
# scripts/run-docker-visual-tests.sh.
#
#   scripts/visual.sh            compare against the committed baselines
#   scripts/visual.sh --update   regenerate the baselines
#   scripts/visual.sh --clean    remove the cached node_modules volume
set -e

cd "$(dirname "$0")/.."

# A TEST_ENV exported by the calling shell must not turn a compare into an update.
unset TEST_ENV

# One source of truth for the image: the CI job.
IMAGE=$(grep -E '^\s*image:\s*["'"'"']?mcr\.microsoft\.com/playwright' .github/workflows/ci.yml | head -1 |
  sed -E "s/.*image:[[:space:]]*['\"]?([^'\"[:space:]]+).*/\1/")
if [ -z "$IMAGE" ]; then
  echo "No Playwright image found in .github/workflows/ci.yml" >&2
  exit 1
fi
VOLUME="code-field-visual-node-modules"
BASELINES="web/test/visual/screenshots"

case "$1" in
  "") ;;
  --clean)
    docker volume rm "$VOLUME" 2>/dev/null && echo "Removed $VOLUME." || echo "No $VOLUME to remove."
    exit 0
    ;;
  --update)
    export TEST_ENV=update
    # The plugin only ever writes baselines, so a renamed or removed test would leave its
    # old ones behind for good. The script always runs the whole suite, so start clean.
    rm -f "$BASELINES"/*/baseline/*.png
    ;;
  *)
    echo "Usage: $0 [--update | --clean]" >&2
    exit 2
    ;;
esac

echo "Visual tests in $IMAGE${TEST_ENV:+ (updating baselines)}"

# --ipc=host: recommended for Chromium, which otherwise runs out of shared memory.
# The node_modules volume keeps the container's Linux install apart from the host's.
# HUSKY=0: npm ci's prepare step would otherwise rewrite the host's git hooks as root.
# The container runs as root, so what it writes is handed back to the calling user —
# Docker Desktop does that by itself; a Linux host does not.
docker run --rm --ipc=host \
  -v "$(pwd)":/work \
  -v "$VOLUME":/work/node_modules \
  -w /work \
  -e PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  -e HUSKY=0 \
  -e TEST_ENV \
  -e HOST_UID="$(id -u)" \
  -e HOST_GID="$(id -g)" \
  "$IMAGE" \
  /bin/bash -c '
    npm ci --no-audit --no-fund &&
      (cd web && npx web-test-runner --config web-test-runner-visual.config.js)
    status=$?
    chown -R "$HOST_UID:$HOST_GID" '"$BASELINES"' 2>/dev/null
    exit $status'

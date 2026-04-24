#!/bin/bash
# Build a Chrome Web Store-ready ZIP.
#
# Outputs:  extension/build-store/merlin-autoapply-vX.Y.Z.zip
#
# Differences from the dev build:
#   - webpack --mode production (no inline source maps, smaller bundles)
#   - manifest version is bumped from CLI argument or package.json
#   - localhost host_permissions and content_scripts matches stripped
#   - default_locale not yet wired (single language: pt-BR)
#
# Usage: ./scripts/build-store.sh [version]
#   version defaults to package.json "version" field
set -euo pipefail

EXT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$EXT_DIR/build-store"
WORK_DIR="$OUT_DIR/staging"

VERSION="${1:-$(node -p "require('$EXT_DIR/package.json').version")}"
ZIP_NAME="merlin-autoapply-v${VERSION}.zip"

echo "==> Building store package v${VERSION}"

# Clean
rm -rf "$WORK_DIR" "$OUT_DIR/$ZIP_NAME"
mkdir -p "$WORK_DIR"

# Production webpack build into dist/
cd "$EXT_DIR"
echo "==> Webpack (production)"
npx webpack --mode production

# Stage files for the ZIP
echo "==> Staging files"
cp -r "$EXT_DIR/dist" "$WORK_DIR/dist"
cp -r "$EXT_DIR/assets" "$WORK_DIR/assets"
# Drop the source PNG from the published bundle.
rm -f "$WORK_DIR/assets/icon-source.png"

# Generate a clean manifest: bump version, strip localhost, drop the `key`
# field (Web Store rejects published manifests that contain it — Google
# generates its own keypair and assigns the published extension ID).
echo "==> Generating production manifest"
node -e "
  const fs = require('fs');
  const path = require('path');
  const m = JSON.parse(fs.readFileSync('$EXT_DIR/manifest.json', 'utf8'));
  m.version = '$VERSION';
  delete m.key;
  m.host_permissions = m.host_permissions.filter(h => !h.includes('localhost'));
  if (Array.isArray(m.content_scripts)) {
    m.content_scripts = m.content_scripts.map(cs => ({
      ...cs,
      matches: (cs.matches || []).filter(p => !p.includes('localhost')),
    }));
  }
  fs.writeFileSync('$WORK_DIR/manifest.json', JSON.stringify(m, null, 2) + '\n');
"

# ZIP
echo "==> Packaging $ZIP_NAME"
cd "$WORK_DIR"
zip -qr "$OUT_DIR/$ZIP_NAME" .

# Report
SIZE=$(du -h "$OUT_DIR/$ZIP_NAME" | awk '{print $1}')
echo ""
echo "Done."
echo "  Package:  $OUT_DIR/$ZIP_NAME"
echo "  Size:     $SIZE"
echo "  Version:  $VERSION"
echo ""
echo "Inspect with:  unzip -l $OUT_DIR/$ZIP_NAME"

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
ZIP_WORK_DIR="$OUT_DIR/store-zip"

VERSION="${1:-$(node -p "require('$EXT_DIR/package.json').version")}"
ZIP_NAME="merlin-autoapply-v${VERSION}.zip"

echo "==> Building store package v${VERSION}"

# Clean
rm -rf "$WORK_DIR" "$ZIP_WORK_DIR" "$OUT_DIR/$ZIP_NAME"
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

# Generate a clean staging manifest for local unpacked QA: bump version and
# strip localhost, but keep the `key` so Chrome gives the unpacked extension
# the allowlisted dev ID. The final Web Store ZIP removes `key` below.
echo "==> Generating staging manifest"
node -e "
  const fs = require('fs');
  const path = require('path');
  const m = JSON.parse(fs.readFileSync('$EXT_DIR/manifest.json', 'utf8'));
  m.version = '$VERSION';
  m.host_permissions = m.host_permissions.filter(h => !h.includes('localhost'));
  if (Array.isArray(m.content_scripts)) {
    m.content_scripts = m.content_scripts.map(cs => ({
      ...cs,
      matches: (cs.matches || []).filter(p => !p.includes('localhost')),
    }));
  }
  if (Array.isArray(m.externally_connectable?.matches)) {
    m.externally_connectable.matches = m.externally_connectable.matches.filter(
      p => !p.includes('localhost')
    );
  }
  fs.writeFileSync('$WORK_DIR/manifest.json', JSON.stringify(m, null, 2) + '\n');
"

# ZIP: copy the unpacked QA bundle, then drop `key` only for the published
# artifact because the Chrome Web Store rejects manifests that contain it.
echo "==> Packaging $ZIP_NAME"
cp -r "$WORK_DIR" "$ZIP_WORK_DIR"
node -e "
  const fs = require('fs');
  const manifestPath = '$ZIP_WORK_DIR/manifest.json';
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  delete m.key;
  fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2) + '\n');
"
cd "$ZIP_WORK_DIR"
zip -qr "$OUT_DIR/$ZIP_NAME" .
rm -rf "$ZIP_WORK_DIR"

# Report
SIZE=$(du -h "$OUT_DIR/$ZIP_NAME" | awk '{print $1}')
echo ""
echo "Done."
echo "  Package:  $OUT_DIR/$ZIP_NAME"
echo "  Size:     $SIZE"
echo "  Version:  $VERSION"
echo ""
echo "Inspect with:  unzip -l $OUT_DIR/$ZIP_NAME"

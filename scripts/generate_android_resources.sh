#!/usr/bin/env bash
# Generate Android-only images and values from the site's committed inputs.
set -euo pipefail
cd "$(dirname "$0")/.."

readonly SOURCE_ICON=assets/images/cim_logo_512.png
readonly RESOURCE_DIR=android/app/src/main/res
readonly DARK_BACKGROUND=$(node -p \
    "require('./_data/theme.json').dark_background")

mkdir -p "$RESOURCE_DIR/values"
sed "s/@DARK_BACKGROUND@/$DARK_BACKGROUND/" \
    android-resources/colors.xml.in > "$RESOURCE_DIR/values/colors.xml"

# Preserve the committed PNG byte-for-byte. Resampling it at build time made
# the APK depend on the particular ImageMagick version installed, preventing
# F-Droid from reproducing the GitHub build.
mkdir -p "$RESOURCE_DIR/drawable-nodpi"
cp "$SOURCE_ICON" "$RESOURCE_DIR/drawable-nodpi/ic_launcher.png"

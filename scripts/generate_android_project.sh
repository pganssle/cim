#!/usr/bin/env bash
# Regenerate the android/ native project from the Capacitor template.
#
# android/ is never committed: it is a deterministic function of the
# @capacitor/cli version pinned in package-lock.json (the template ships
# inside that package) plus the inputs in this repo:
#
#   patches/android/*.patch  edits to generated files
#   scripts/generate_android_resources.sh  resources derived from web inputs
#
# Normally invoked via `make android-project`, which skips it unless one
# of those inputs has changed.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf android
# `cap add` copies webDir into the project as a side effect; the real
# copy happens later via `cap sync`, but the directory has to exist.
mkdir -p _site
npx cap add android

for p in patches/android/*.patch; do
    git apply --directory=android "$p"
done

# Template content we don't use: example tests, the Capacitor-logo
# splash images (styles-xml.patch replaces them with a solid color),
# and the stock launcher icons (the generated CIM icons use the same
# resource names).
rm -r android/app/src/test android/app/src/androidTest
rm -r android/app/src/main/res/drawable*
rm android/app/src/main/res/mipmap-*/ic_launcher*.png

./scripts/generate_android_resources.sh

echo "Generated android/ (Capacitor $(npx cap --version))"

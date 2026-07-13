#!/usr/bin/env bash
# Re-derive patches/android/*.patch from the current android/ tree.
#
# Workflow for changing the native project: run `make android-project`,
# edit the files in android/ directly (e.g. from Android Studio), then
# run this (via `make android-patches`) to capture your edits back into
# the committed patches. To start patching a generated file that isn't
# patched yet, add its path to the list below.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d android ]; then
    echo "error: no android/ tree to diff; run 'make android-project' first" >&2
    exit 1
fi

PATCHED_FILES=(
    app/build.gradle
    app/src/main/java/us/ganbar/cim/MainActivity.java
    app/src/main/res/values/styles.xml
)

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Generate a pristine copy of the template to diff against, keeping the
# edited tree (and its Gradle build state) intact.
mv android "$tmp/edited"
mkdir -p _site
npx cap add android > /dev/null
mv android "$tmp/pristine"
mv "$tmp/edited" android

for f in "${PATCHED_FILES[@]}"; do
    name=$(basename "$f" | tr '.' '-')
    diff -u --label "a/$f" --label "b/$f" "$tmp/pristine/$f" "android/$f" \
        > "patches/android/$name.patch" && rm "patches/android/$name.patch" || {
        status=$?
        # diff exits 1 when the files differ (a patch was written) and
        # >1 on real errors; identical files need no patch.
        [ "$status" -eq 1 ] || exit "$status"
    }
done

echo "Updated patches:"
ls patches/android/

#!/usr/bin/env bash
# Build the unsigned release APK twice from clean generated projects.
set -euo pipefail
cd "$(dirname "$0")/.."

readonly VERSION_NAME=$(node -p "require('./android-version.json').versionName")
readonly VERSION_CODE=$(node -p "require('./android-version.json').versionCode")
readonly APK=android/app/build/outputs/apk/release/app-release-unsigned.apk
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

build() {
    rm -rf android
    make android-assets
    (cd android && ./gradlew assembleRelease \
        -PcimVersionName="$VERSION_NAME" -PcimVersionCode="$VERSION_CODE")
}

build
cp "$APK" "$tmp/first.apk"
build
cmp "$tmp/first.apk" "$APK"

echo "Reproducible APK: $(sha256sum "$APK" | cut -d' ' -f1)"

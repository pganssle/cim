#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/tag_android_version.sh

assert_equal() {
    if [[ $1 != "$2" ]]; then
        echo "error: expected '$2', got '$1'" >&2
        exit 1
    fi
}

assert_fails() {
    if "$@" > /dev/null 2>&1; then
        echo "error: command unexpectedly succeeded: $*" >&2
        exit 1
    fi
}

assert_equal "$(version_code 2026.07.3)" 60703000
assert_equal "$(version_code v2026.07.3.dev0)" 60703001
assert_equal "$(version_code v2026.07.3.dev998)" 60703999
assert_equal "$(version_code v2229.12.99.dev998)" 2091299999

for invalid in 1.2.3 26.07.3 2026.00.0 2026.13.0 2026.07.100 \
        2026.07.0.dev999 2230.01.0 not-a-version; do
    assert_fails version_code "$invalid"
done

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git init --quiet "$tmp"
touch "$tmp/README"
git -C "$tmp" add README
git -C "$tmp" -c user.name=Test -c user.email=test@example.com \
    commit --quiet -m 'Initial commit'
pushd "$tmp" > /dev/null

year=$(date +%Y)
month=$(date +%m)
assert_equal "$(next_version false)" "$year.$month.0"
assert_equal "$(next_version true)" "$year.$month.0.dev0"

cat > android-version.json <<EOF
{
  "versionName": "$year.$month.7",
  "versionCode": 1
}
EOF
assert_equal "$(next_version false)" "$year.$month.8"
assert_equal "$(next_version true)" "$year.$month.7.dev0"
rm android-version.json

git tag "v$year.$month.3"
assert_equal "$(next_version false)" "$year.$month.4"
assert_equal "$(next_version true)" "$year.$month.3.dev0"
git tag "v$year.$month.3.dev0"
assert_equal "$(next_version true)" "$year.$month.3.dev1"

touch dirty
assert_fails create_tag false
git add dirty
git -c user.name=Test -c user.email=test@example.com \
    commit --quiet -m 'Make tree clean again'

mkdir -p scripts fdroid/metadata changelog.d fastlane/metadata/android/en-US/changelogs
cp "$OLDPWD/scripts/update_android_version.mjs" scripts/
cp "$OLDPWD/scripts/update_changelog.mjs" scripts/
cat > android-version.json <<'EOF'
{
  "versionName": "2020.01.0",
  "versionCode": 1
}
EOF
cat > fdroid/metadata/us.ganbar.cim.yml <<'EOF'
Builds:
  - versionName: 2020.01.0
    versionCode: 1
    commit: v2020.01.0
CurrentVersion: 2020.01.0
CurrentVersionCode: 1
EOF
cat > NEWS.md <<'EOF'
## Web-only Preview

### 2099-12-31
- Added a release test entry.

## Android Version v2020.01.0

### 2000-01-01
- Added the original release.
EOF
echo 'Contributor instructions.' > changelog.d/README
git add android-version.json fdroid scripts
git add NEWS.md changelog.d
git -c user.name=Test -c user.email=test@example.com \
    commit --quiet -m 'Add Android metadata'
git config user.name Test
git config user.email test@example.com
create_tag false > /dev/null
assert_equal "$(git tag --points-at HEAD)" "v$year.$month.4"
assert_equal "$(node -p "require('./android-version.json').versionName")" \
    "$year.$month.4"
assert_equal "$(git log -1 --format=%s)" "Prepare v$year.$month.4"
code=$(version_code "$year.$month.4")
test -s "fastlane/metadata/android/en-US/changelogs/$code.txt"
assert_equal "$(cat "fastlane/metadata/android/en-US/changelogs/$code.txt")" \
    '- Added a release test entry.'
if grep -q 'Web-only Preview' NEWS.md; then
    echo 'error: released NEWS.md still contains Web-only Preview' >&2
    exit 1
fi
grep -q "^## Android Version v$year.$month.4$" NEWS.md

released_head=$(git rev-parse HEAD)
released_news=$(cat NEWS.md)
if empty_release_output=$(printf '\n' | create_tag false 2>&1); then
    echo 'error: empty release unexpectedly proceeded without confirmation' >&2
    exit 1
fi
grep -q "warning: there are no changelog entries to include in v$year.$month.5" \
    <<< "$empty_release_output"
grep -q 'Create the release anyway? \[y/N\]' <<< "$empty_release_output"
assert_equal "$(git rev-parse HEAD)" "$released_head"
assert_equal "$(node -p "require('./android-version.json').versionName")" \
    "$year.$month.4"
if git tag --list "v$year.$month.5" | grep -q .; then
    echo 'error: declining an empty release still created its tag' >&2
    exit 1
fi

printf 'y\n' | create_tag false > /dev/null 2>&1
assert_equal "$(git tag --points-at HEAD)" "v$year.$month.5"
assert_equal "$(node -p "require('./android-version.json').versionName")" \
    "$year.$month.5"
assert_equal "$(git log -1 --format=%s)" "Prepare v$year.$month.5"
assert_equal "$(cat NEWS.md)" "$released_news"
empty_code=$(version_code "$year.$month.5")
if [[ -e fastlane/metadata/android/en-US/changelogs/$empty_code.txt ]]; then
    echo 'error: empty release created an F-Droid changelog' >&2
    exit 1
fi
popd > /dev/null

echo 'Version tagging tests passed'

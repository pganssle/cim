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

assert_equal "$(version_code 26.07.3)" 607003000
assert_equal "$(version_code v26.07.3.dev0)" 607003001
assert_equal "$(version_code v26.07.3.dev998)" 607003999

for invalid in 1.2.3 26.00.0 26.13.0 26.07.1000 26.07.0.dev999 \
        41.01.0 not-a-version; do
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

year=$(date +%y)
month=$(date +%m)
assert_equal "$(next_version false)" "$year.$month.0"
assert_equal "$(next_version true)" "$year.$month.0.dev0"

git tag "v$year.$month.3"
assert_equal "$(next_version false)" "$year.$month.4"
assert_equal "$(next_version true)" "$year.$month.3.dev0"
git tag "v$year.$month.3.dev0"
assert_equal "$(next_version true)" "$year.$month.3.dev1"

touch dirty
assert_fails create_tag false
popd > /dev/null

echo 'Version tagging tests passed'

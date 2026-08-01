#!/usr/bin/env bash
# Validate CIM's canonical metadata with the real fdroiddata toolchain.
set -euo pipefail
cd "$(dirname "$0")/.."

readonly APP_ID=us.ganbar.cim
readonly FDROIDDATA_REF=acd6c99e003dc62915aee5e5e5807a9322c548a8
readonly FDROIDSERVER_REF=6af4c4216e43d0fcb29e33919cd0fe8fef7e7400
readonly BUILD_IMAGE='registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie@sha256:9bae53bb4ddbf8fa5bb7385bf2e62e7c6318f99ab0d25b2a551ad38abb528068'
readonly CACHE_DIR=${FDROID_TEST_CACHE:-.misc_local/fdroid-test}
readonly FDROIDDATA_DIR="$CACHE_DIR/fdroiddata"
readonly FDROIDSERVER_DIR="$CACHE_DIR/fdroidserver"
readonly METADATA="$FDROIDDATA_DIR/metadata/$APP_ID.yml"
tmp=$(mktemp -d)

usage() {
    echo "usage: $0 [lint | build [GIT_COMMIT] | verify SIGNED_APK]" >&2
}

clone_at() {
    local url=$1
    local ref=$2
    local destination=$3
    if [[ -d $destination/.git ]]; then
        if ! git -C "$destination" cat-file -e "$ref^{commit}"; then
            git -C "$destination" fetch --depth=1 origin "$ref"
        fi
        git -C "$destination" checkout --quiet --detach "$ref"
        return
    fi
    if [[ -e $destination ]]; then
        echo "error: $destination exists but is not a Git checkout" >&2
        exit 1
    fi
    mkdir -p "$(dirname "$destination")"
    git clone --filter=blob:none --no-checkout "$url" "$destination"
    git -C "$destination" checkout "$ref"
}

clone_at https://gitlab.com/fdroid/fdroiddata.git "$FDROIDDATA_REF" \
    "$FDROIDDATA_DIR"
clone_at https://gitlab.com/fdroid/fdroidserver.git "$FDROIDSERVER_REF" \
    "$FDROIDSERVER_DIR"

if [[ -e $METADATA ]]; then
    echo "error: test app metadata unexpectedly exists in pinned fdroiddata" >&2
    exit 1
fi
cp "fdroid/metadata/$APP_ID.yml" "$METADATA"
cp "$FDROIDDATA_DIR/config.yml" "$tmp/config.yml"
echo 'sdk_path: /opt/android-sdk' >> "$tmp/config.yml"
chmod 600 "$tmp/config.yml"
trap 'rm -f "$METADATA"; rm -rf "$tmp"' EXIT

run_fdroid() {
    docker run --rm \
        -v "$(realpath "$FDROIDDATA_DIR"):/repo" \
        -v "$(realpath "$FDROIDSERVER_DIR"):/fdroidserver:ro" \
        -v "$tmp/config.yml:/repo/config.yml:ro" \
        -w /repo -e PYTHONPATH=/fdroidserver \
        "$BUILD_IMAGE" python3 -m fdroidserver "$@"
}

case ${1:-lint} in
    lint)
        [[ $# -le 1 ]] || { usage; exit 2; }
        run_fdroid lint "$APP_ID"
        ;;
    build)
        [[ $# -le 2 ]] || { usage; exit 2; }
        if [[ -n ${2:-} ]]; then
            sed -i "s/^    commit: .*/    commit: $2/" "$METADATA"
        fi
        # The upstream APK does not exist until the release job completes.
        # Build it first, then compare it with the signed APK in `verify`.
        sed -i '/^Binaries:/d; /^AllowedAPKSigningKeys:/d' "$METADATA"
        run_fdroid build --on-server "$APP_ID"
        ;;
    verify)
        [[ $# -eq 2 ]] || { usage; exit 2; }
        readonly SIGNED_APK=$(realpath "$2")
        readonly VERSION_CODE=$(node -p \
            "require('./android-version.json').versionCode")
        readonly UNSIGNED_APK="$FDROIDDATA_DIR/unsigned/${APP_ID}_${VERSION_CODE}.apk"
        if [[ ! -f $UNSIGNED_APK ]]; then
            echo "error: no F-Droid APK to compare; run the build first" >&2
            exit 1
        fi

        expected_key=$(sed -n 's/^AllowedAPKSigningKeys: //p' "$METADATA")
        readonly SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
        readonly APKSIGNER="$SDK/build-tools/34.0.0/apksigner"
        if [[ ! -x $APKSIGNER ]]; then
            echo "error: verification requires Android build-tools 34.0.0" >&2
            exit 1
        fi
        actual_key=$("$APKSIGNER" verify --print-certs "$SIGNED_APK" \
            | sed -n 's/^Signer #1 certificate SHA-256 digest: //p')
        if [[ $actual_key != "$expected_key" ]]; then
            echo "error: release APK has an unexpected signing certificate" >&2
            exit 1
        fi

        docker run --rm \
            -v "$(realpath "$FDROIDDATA_DIR"):/repo" \
            -v "$(realpath "$FDROIDSERVER_DIR"):/fdroidserver:ro" \
            -v "$tmp/config.yml:/repo/config.yml:ro" \
            -v "$SIGNED_APK:/signed.apk:ro" \
            -w /repo -e PYTHONPATH=/fdroidserver \
            "$BUILD_IMAGE" python3 -c \
            'import sys, tempfile; from fdroidserver import common; common.config = common.read_config(); tmp = tempfile.TemporaryDirectory(); result = common.verify_apks(sys.argv[1], sys.argv[2], tmp.name); print(result or "F-Droid APK matches the signed release APK"); raise SystemExit(bool(result))' \
            /signed.apk "/repo/unsigned/${APP_ID}_${VERSION_CODE}.apk"
        ;;
    *)
        usage
        exit 2
        ;;
esac

#!/usr/bin/env bash
# Create Android release and development tags.
set -euo pipefail

readonly VERSION_CODE_EPOCH=20
readonly MAX_VERSION_CODE=2100000000

parse_version() {
    local version=${1#v}
    local extra
    IFS=. read -r PARSED_YEAR PARSED_MONTH PARSED_PATCH PARSED_DEV extra <<< "$version"

    if [[ -n ${extra:-} || -z ${PARSED_YEAR:-} || -z ${PARSED_MONTH:-} || \
          -z ${PARSED_PATCH:-} ]]; then
        return 1
    fi
    for field in "$PARSED_YEAR" "$PARSED_MONTH" "$PARSED_PATCH"; do
        case $field in
            *[!0-9]*|'') return 1 ;;
        esac
    done
    if [[ ${#PARSED_YEAR} -ne 2 || ${#PARSED_MONTH} -ne 2 ]]; then
        return 1
    fi

    PARSED_YEAR=$((10#$PARSED_YEAR))
    PARSED_MONTH=$((10#$PARSED_MONTH))
    PARSED_PATCH=$((10#$PARSED_PATCH))
    PARSED_DEV=${PARSED_DEV:-}
    if [[ -n $PARSED_DEV ]]; then
        if [[ $PARSED_DEV != dev* ]]; then
            return 1
        fi
        PARSED_DEV=${PARSED_DEV#dev}
        case $PARSED_DEV in
            *[!0-9]*|'') return 1 ;;
        esac
        PARSED_DEV=$((10#$PARSED_DEV))
    fi

    if (( PARSED_YEAR < VERSION_CODE_EPOCH ||
          PARSED_MONTH < 1 || PARSED_MONTH > 12 ||
          PARSED_PATCH < 0 || PARSED_PATCH > 999 )); then
        return 1
    fi
    if [[ -n $PARSED_DEV ]] && (( PARSED_DEV > 998 )); then
        return 1
    fi
}

version_code() {
    parse_version "$1" || {
        echo "error: invalid version: $1" >&2
        return 1
    }

    local build=0
    if [[ -n $PARSED_DEV ]]; then
        build=$((PARSED_DEV + 1))
    fi
    local code=$((
        (PARSED_YEAR - VERSION_CODE_EPOCH) * 100000000 +
        PARSED_MONTH * 1000000 +
        PARSED_PATCH * 1000 +
        build
    ))
    if (( code > MAX_VERSION_CODE )); then
        echo "error: version exceeds Android's maximum versionCode" >&2
        return 1
    fi
    echo "$code"
}

next_version() {
    local dev=$1
    local year month
    year=$((10#$(date +%y)))
    month=$((10#$(date +%m)))
    local latest_patch=-1
    local latest_dev=-1

    while read -r tag; do
        if ! parse_version "$tag"; then
            continue
        fi
        if (( PARSED_YEAR != year || PARSED_MONTH != month )); then
            continue
        fi
        if (( PARSED_PATCH > latest_patch )); then
            latest_patch=$PARSED_PATCH
            latest_dev=-1
        fi
        if (( PARSED_PATCH == latest_patch )) && [[ -n $PARSED_DEV ]] && \
                (( PARSED_DEV > latest_dev )); then
            latest_dev=$PARSED_DEV
        fi
    done < <(git tag --list 'v*')

    if (( latest_patch < 0 )); then
        latest_patch=0
    elif [[ $dev == false ]]; then
        latest_patch=$((latest_patch + 1))
    fi

    local name
    printf -v name '%02d.%02d.%d' "$year" "$month" "$latest_patch"
    if [[ $dev == true ]]; then
        name+=.dev$((latest_dev + 1))
    fi
    version_code "$name" > /dev/null
    echo "$name"
}

create_tag() {
    local dev=$1
    if [[ -n $(git status --porcelain) ]]; then
        echo "error: refusing to tag a dirty working tree" >&2
        return 1
    fi

    local version
    version=$(next_version "$dev")
    local code
    code=$(version_code "$version")
    git tag "v$version"
    echo "Created v$version (versionCode $code)"
}

main() {
    case ${1:-} in
        '') create_tag false ;;
        --dev)
            if [[ $# -ne 1 ]]; then
                echo "usage: $0 [--dev | --version-code VERSION]" >&2
                return 2
            fi
            create_tag true
            ;;
        --version-code)
            if [[ $# -ne 2 ]]; then
                echo "usage: $0 [--dev | --version-code VERSION]" >&2
                return 2
            fi
            version_code "$2"
            ;;
        *)
            echo "usage: $0 [--dev | --version-code VERSION]" >&2
            return 2
            ;;
    esac
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
    main "$@"
fi

#!/usr/bin/env bash
# Generate Android-only images and values from the site's committed inputs.
set -euo pipefail
cd "$(dirname "$0")/.."

if command -v magick > /dev/null; then
    readonly IMAGE_MAGICK=(magick)
elif command -v convert > /dev/null; then
    readonly IMAGE_MAGICK=(convert)
else
    echo "error: generating Android launcher icons requires ImageMagick" >&2
    exit 1
fi

readonly SOURCE_ICON=assets/images/cim_logo_512.png
readonly RESOURCE_DIR=android/app/src/main/res
readonly DARK_BACKGROUND=$(node -p \
    "require('./_data/theme.json').dark_background")

mkdir -p "$RESOURCE_DIR/values"
sed "s/@DARK_BACKGROUND@/$DARK_BACKGROUND/" \
    android-resources/colors.xml.in > "$RESOURCE_DIR/values/colors.xml"

# Android's baseline launcher icon is 48 px. Adaptive-icon foreground layers
# use a 108 px canvas; the logo occupies the central 72 px safe zone.
for density_and_scale in mdpi:1 hdpi:1.5 xhdpi:2 xxhdpi:3 xxxhdpi:4; do
    density=${density_and_scale%%:*}
    scale=${density_and_scale##*:}
    legacy_size=$(awk "BEGIN { print int(48 * $scale) }")
    foreground_size=$(awk "BEGIN { print int(108 * $scale) }")
    logo_size=$(awk "BEGIN { print int(72 * $scale) }")
    output_dir="$RESOURCE_DIR/mipmap-$density"
    mkdir -p "$output_dir"

    "${IMAGE_MAGICK[@]}" "$SOURCE_ICON" -resize "${legacy_size}x${legacy_size}!" \
        "$output_dir/ic_launcher.webp"
    "${IMAGE_MAGICK[@]}" "$SOURCE_ICON" -resize "${legacy_size}x${legacy_size}!" \
        \( +clone -alpha extract \
           -draw "fill black polygon 0,0 0,$legacy_size $legacy_size,0 \
                  fill white circle $((legacy_size / 2)),$((legacy_size / 2)) \
                  $((legacy_size / 2)),0" \) \
        -alpha off -compose CopyOpacity -composite \
        "$output_dir/ic_launcher_round.webp"
    "${IMAGE_MAGICK[@]}" -size "${foreground_size}x${foreground_size}" canvas:none \
        \( "$SOURCE_ICON" -resize "${logo_size}x${logo_size}!" \) \
        -gravity center -composite "$output_dir/ic_launcher_foreground.webp"
done

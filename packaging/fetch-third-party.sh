#!/bin/bash
# Fetches the native binaries that get embedded into the single-file executable.
# Output: packaging/third-party/
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p third-party
cd third-party

# ---- ffmpeg / ffprobe: static arm64 builds for macOS (ffmpeg-static releases) ----
FFMPEG_RELEASE="b6.1.1"
if [ ! -x ffmpeg ]; then
    echo "Fetching ffmpeg (arm64)..."
    curl -fsSL -o ffmpeg \
        "https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_RELEASE}/ffmpeg-darwin-arm64"
    chmod +x ffmpeg
fi

if [ ! -x ffprobe ]; then
    echo "Fetching ffprobe (arm64)..."
    curl -fsSL -o ffprobe \
        "https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_RELEASE}/ffprobe-darwin-arm64"
    chmod +x ffprobe
fi

# ---- mkbrr (autobrr) darwin-arm64 ----
if [ ! -x mkbrr ]; then
    echo "Fetching mkbrr..."
    MKBRR_VERSION=$(curl -fsSL -o /dev/null -w '%{url_effective}' \
        https://github.com/autobrr/mkbrr/releases/latest \
        | grep -o '[^/]*$' | sed 's/^v//')
    curl -fsSL -o mkbrr.tar.gz \
        "https://github.com/autobrr/mkbrr/releases/download/v${MKBRR_VERSION}/mkbrr_${MKBRR_VERSION}_darwin_arm64.tar.gz"
    tar -xzf mkbrr.tar.gz
    rm -f mkbrr.tar.gz
    chmod +x mkbrr
fi

# ---- sharp native addon + libvips dylib (from installed npm deps) ----
if [ ! -f sharp-darwin-arm64.node ]; then
    echo "Copying sharp native addon..."
    cp ../../node_modules/@img/sharp-darwin-arm64/lib/sharp-darwin-arm64.node .
fi
if [ ! -f libvips-cpp.dylib ]; then
    echo "Copying libvips dylib..."
    cp ../../node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips-cpp.*.dylib libvips-cpp.dylib
fi

# ---- mediainfo.js wasm (from installed npm deps) ----
if [ ! -f MediaInfoModule.wasm ]; then
    echo "Copying mediainfo wasm..."
    cp ../../node_modules/mediainfo.js/dist/MediaInfoModule.wasm .
fi

echo "Third-party binaries ready in $(pwd):"
ls -lh

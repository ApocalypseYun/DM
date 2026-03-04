#!/bin/sh
set -eu

TARGET_DIR="${1:-$(dirname "$0")/../vendor}"
mkdir -p "$TARGET_DIR"

curl -fL \
  "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz" \
  -o "$TARGET_DIR/piper_linux_x86_64.tar.gz"

echo "Downloaded Piper runtime to $TARGET_DIR/piper_linux_x86_64.tar.gz"

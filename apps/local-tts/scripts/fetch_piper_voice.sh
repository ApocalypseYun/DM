#!/usr/bin/env sh
set -eu

TARGET_DIR="${1:-/models/piper}"
MODEL_BASENAME="zh_CN-huayan-medium"
BASE_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium"

mkdir -p "$TARGET_DIR"

curl -fL "$BASE_URL/$MODEL_BASENAME.onnx" -o "$TARGET_DIR/$MODEL_BASENAME.onnx"
curl -fL "$BASE_URL/$MODEL_BASENAME.onnx.json" -o "$TARGET_DIR/$MODEL_BASENAME.onnx.json"

echo "Downloaded Piper voice files to $TARGET_DIR"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_NAME="${RUN_NAME:-document-obb}"
MODEL_PATH="${MODEL_PATH:-${ROOT_DIR}/runs/${RUN_NAME}/weights/best.pt}"
IMGSZ="${IMGSZ:-1024}"

if [[ ! -f "${MODEL_PATH}" ]]; then
  echo "Missing trained weights: ${MODEL_PATH}"
  exit 1
fi

if ! command -v yolo >/dev/null 2>&1; then
  echo "Ultralytics CLI not found. Install it first."
  exit 1
fi

yolo export \
  model="${MODEL_PATH}" \
  format=onnx \
  imgsz="${IMGSZ}" \
  simplify=True

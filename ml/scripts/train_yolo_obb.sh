#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_CONFIG="${ROOT_DIR}/configs/document-detector.data.yaml"
BASE_MODEL="${BASE_MODEL:-yolo11n-obb.pt}"
EPOCHS="${EPOCHS:-100}"
IMGSZ="${IMGSZ:-1024}"
BATCH="${BATCH:-16}"
PROJECT_DIR="${ROOT_DIR}/runs"
RUN_NAME="${RUN_NAME:-document-obb}"

if [[ ! -f "${DATA_CONFIG}" ]]; then
  echo "Missing ${DATA_CONFIG}"
  echo "Copy configs/document-detector.data.example.yaml to configs/document-detector.data.yaml and edit it."
  exit 1
fi

if ! command -v yolo >/dev/null 2>&1; then
  echo "Ultralytics CLI not found. Install it first:"
  echo "python3 -m venv ml/.venv"
  echo "source ml/.venv/bin/activate"
  echo "pip install -U pip ultralytics"
  exit 1
fi

yolo obb train \
  data="${DATA_CONFIG}" \
  model="${BASE_MODEL}" \
  epochs="${EPOCHS}" \
  imgsz="${IMGSZ}" \
  batch="${BATCH}" \
  project="${PROJECT_DIR}" \
  name="${RUN_NAME}"

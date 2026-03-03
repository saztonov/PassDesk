# ML Scanner Guide

This folder contains the minimum workflow to move the web document scanner
from a heuristic detector to a model-based detector.

Current project state:
- The client already supports an optional ONNX detector backend.
- Without a model, the scanner still works with the built-in detector.
- To enable the ML path, you need to train and export a YOLO OBB model.

## Decision

Use `YOLO OBB`.

Why:
- fastest to annotate;
- easier than segmentation for a first production version;
- gives an oriented rectangle that maps well to document corners;
- simpler to export to ONNX and post-process in web.

## What You Need

1. A dataset of real document photos.
2. CVAT for annotation.
3. Python environment with `ultralytics`.
4. Exported `best.onnx`.

## Folder Layout

```text
ml/
  README.md
  .gitignore
  configs/
    document-detector.data.example.yaml
    classes.txt
  dataset/
    README.md
    raw/
    yolo-obb/
  scripts/
    prepare_dirs.sh
    train_yolo_obb.sh
    export_onnx.sh
```

## Dataset Rules

Collect real photos from the same kinds of phones your users have.

Minimum for a first pass:
- `300-500` images

Preferred:
- `1000+` images

Must include:
- open passports
- single-page paper documents
- plastic/card documents
- different tables/backgrounds
- poor lighting
- shadows
- tilt/rotation
- partial perspective distortion
- close and medium distance shots

## Classes

Start with 3 classes:
- `passport_open`
- `card_document`
- `paper_document`

If annotation is too slow, start with one class:
- `document`

## Annotation

Use CVAT.

Create shapes as oriented boxes around the **outer border of the document**.
For open passports:
- annotate the whole opened passport booklet, not the inner page only.

Export format:
- `Ultralytics YOLO OBB`

## Training

Prepare Python once:

```bash
cd ml
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -U ultralytics
```

Copy and edit the dataset config:

```bash
cp configs/document-detector.data.example.yaml configs/document-detector.data.yaml
```

Then train:

```bash
./scripts/train_yolo_obb.sh
```

The default base model is:
- `yolo11n-obb.pt`

That is the right starting point for browser deployment.

## Export to ONNX

After training:

```bash
./scripts/export_onnx.sh
```

Expected output:

```text
ml/runs/obb/train/weights/best.onnx
```

## Enable in the Web Client

Put the exported model somewhere the client can fetch it.

Recommended path:

```text
client/public/models/document-corners.onnx
```

Then set env:

```env
VITE_SCANNER_DETECTOR=onnx
VITE_SCANNER_ONNX_MODEL_URL=/models/document-corners.onnx
VITE_SCANNER_ONNX_PROVIDER=auto
VITE_SCANNER_ONNX_WASM_PATHS=
VITE_SCANNER_ONNX_INPUT_SIZE=1024
```

Rebuild client:

```bash
docker compose up -d --build client
```

## Important Note About Output Format

The current web scanner expects a detector that returns:
- `corners`: 8 normalized values
- optional `confidence`

A plain YOLO OBB export will not match that contract directly.

That is expected.

Next step after you get `best.onnx`:
- I will adapt the web post-processing to decode YOLO OBB output and convert it
  into 4 document corners for the scanner.

## What To Do First

If you are starting from zero:

1. Read [dataset/README.md](/Users/denis/Documents/deskpass/PassDesk/ml/dataset/README.md)
2. Create the CVAT task
3. Collect and annotate photos
4. Export `Ultralytics YOLO OBB`
5. Run `train_yolo_obb.sh`
6. Run `export_onnx.sh`
7. Hand me `best.onnx`

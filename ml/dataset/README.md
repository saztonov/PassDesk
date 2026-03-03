# Dataset Instructions

This is the shortest path to a useful first model.

## 1. Collect Photos

Put original photos into:

```text
ml/dataset/raw/
```

Collect:
- open passports
- paper documents
- card documents
- different phones
- different distances
- bright and dark scenes
- shadows
- desk backgrounds

Do not over-clean the data.
Real bad photos are useful.

## 2. Create a CVAT Task

Suggested task name:

```text
document-scanner-obb
```

Labels:
- `passport_open`
- `card_document`
- `paper_document`

If you want the fastest start, use one label:
- `document`

## 3. Annotate

Draw an oriented box around the full outer contour of the document.

Rules:
- passport open: full booklet, not inner page only
- card: full card border
- paper: outer page border
- ignore background
- ignore table edges
- ignore shadows

## 4. Export

Export format:

```text
Ultralytics YOLO OBB
```

Unpack the export into:

```text
ml/dataset/yolo-obb/
```

Expected structure:

```text
ml/dataset/yolo-obb/
  images/
    train/
    val/
    test/
  labels/
    train/
    val/
    test/
  data.yaml
```

## 5. Update Config If Needed

If CVAT generated its own `data.yaml`, compare it with:

```text
ml/configs/document-detector.data.example.yaml
```

Use whichever correctly matches your exported folders.

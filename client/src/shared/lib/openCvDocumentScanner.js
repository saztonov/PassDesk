let openCvPromise = null;

const clamp = (value, min, max) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const distance = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
};

const getLongShortRatio = (points) => {
  const width = (distance(points[0], points[1]) + distance(points[2], points[3])) / 2;
  const height = (distance(points[0], points[3]) + distance(points[1], points[2])) / 2;
  const longSide = Math.max(width, height);
  const shortSide = Math.max(1, Math.min(width, height));

  return longSide / shortSide;
};

const orderQuad = (points) => {
  if (!Array.isArray(points) || points.length !== 4) {
    return null;
  }

  const sums = points.map((point) => point.x + point.y);
  const diffs = points.map((point) => point.x - point.y);

  const topLeft = points[sums.indexOf(Math.min(...sums))];
  const bottomRight = points[sums.indexOf(Math.max(...sums))];
  const topRight = points[diffs.indexOf(Math.max(...diffs))];
  const bottomLeft = points[diffs.indexOf(Math.min(...diffs))];
  const ordered = [topLeft, topRight, bottomRight, bottomLeft];
  const unique = new Set(ordered.map((point) => `${point.x}:${point.y}`));

  return unique.size === 4 ? ordered : null;
};

const getOpenCv = async () => {
  if (!openCvPromise) {
    openCvPromise = import("@techstark/opencv-js").then((module) => {
      const cvModule = module.default || module;

      if (cvModule?.getBuildInformation) {
        return cvModule;
      }

      return new Promise((resolve) => {
        cvModule.onRuntimeInitialized = () => resolve(cvModule);
      });
    });
  }

  return openCvPromise;
};

const matPointsToArray = (mat) => {
  const raw = mat.data32S?.length ? Array.from(mat.data32S) : Array.from(mat.data32F || []);
  const points = [];

  for (let index = 0; index < raw.length; index += 2) {
    points.push({
      x: Number(raw[index]),
      y: Number(raw[index + 1]),
    });
  }

  return points;
};

const normalizePoints = (points, scaleX, scaleY, maxWidth, maxHeight) => {
  const ordered = orderQuad(
    points.map((point) => ({
      x: clamp(point.x * scaleX, 0, maxWidth - 1),
      y: clamp(point.y * scaleY, 0, maxHeight - 1),
    })),
  );

  return ordered;
};

const getDetectorAttempts = (documentType) => {
  if (documentType === "passport") {
    return [
      { maxDimension: 1600, blur: 5, lower: 20, upper: 80, close: 5, minAreaRatio: 0.18 },
      { maxDimension: 1400, blur: 5, lower: 14, upper: 64, close: 7, minAreaRatio: 0.14 },
      { maxDimension: 1200, blur: 7, lower: 10, upper: 48, close: 9, minAreaRatio: 0.1 },
    ];
  }

  return [
    { maxDimension: 1400, blur: 5, lower: 28, upper: 110, close: 5, minAreaRatio: 0.12 },
    { maxDimension: 1200, blur: 5, lower: 18, upper: 72, close: 7, minAreaRatio: 0.08 },
  ];
};

const detectWithAttempt = (cv, image, attempt, documentType) => {
  const allocated = [];
  const allocate = (mat) => {
    allocated.push(mat);
    return mat;
  };

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    const original = allocate(cv.imread(image));
    const maxSide = Math.max(original.cols, original.rows);
    const scale =
      maxSide > attempt.maxDimension ? attempt.maxDimension / maxSide : 1;
    const working =
      scale < 1
        ? allocate(new cv.Mat())
        : original;

    if (scale < 1) {
      cv.resize(
        original,
        working,
        new cv.Size(
          Math.max(1, Math.round(original.cols * scale)),
          Math.max(1, Math.round(original.rows * scale)),
        ),
        0,
        0,
        cv.INTER_AREA,
      );
    }

    const gray = allocate(new cv.Mat());
    const blurred = allocate(new cv.Mat());
    const normalized = allocate(new cv.Mat());
    const edges = allocate(new cv.Mat());
    const closed = allocate(new cv.Mat());
    const kernel = allocate(
      cv.getStructuringElement(
        cv.MORPH_RECT,
        new cv.Size(attempt.close, attempt.close),
      ),
    );

    cv.cvtColor(working, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(
      gray,
      blurred,
      new cv.Size(attempt.blur, attempt.blur),
      0,
      0,
      cv.BORDER_DEFAULT,
    );
    cv.normalize(blurred, normalized, 0, 255, cv.NORM_MINMAX);
    cv.Canny(normalized, edges, attempt.lower, attempt.upper);
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);
    cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const minArea = closed.cols * closed.rows * attempt.minAreaRatio;
    const scaleX = original.cols / working.cols;
    const scaleY = original.rows / working.rows;
    let bestCandidate = null;

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const area = cv.contourArea(contour);
      if (!Number.isFinite(area) || area < minArea) {
        contour.delete();
        continue;
      }

      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, Math.max(8, perimeter * 0.02), true);

      let points = null;
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        points = normalizePoints(
          matPointsToArray(approx),
          scaleX,
          scaleY,
          original.cols,
          original.rows,
        );
      }

      if (!points) {
        const rect = cv.minAreaRect(contour);
        points = normalizePoints(
          cv.RotatedRect.points(rect),
          scaleX,
          scaleY,
          original.cols,
          original.rows,
        );
      }

      approx.delete();
      contour.delete();

      if (!points) {
        continue;
      }

      const ratio = getLongShortRatio(points);
      const ratioPenalty =
        documentType === "passport"
          ? Math.abs(ratio - 1.42) * 0.12
          : Math.abs(ratio - 1.4) * 0.08;
      const borderPenalty = points.some(
        (point) =>
          point.x < original.cols * 0.01 ||
          point.y < original.rows * 0.01 ||
          point.x > original.cols * 0.99 ||
          point.y > original.rows * 0.99,
      )
        ? 0.02
        : 0;
      const score = area / (closed.cols * closed.rows) - ratioPenalty - borderPenalty;

      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { score, points };
      }
    }

    if (!bestCandidate) {
      return null;
    }

    return bestCandidate.points;
  } finally {
    contours.delete();
    hierarchy.delete();
    allocated.reverse().forEach((mat) => {
      try {
        mat.delete();
      } catch {
        // ignore OpenCV cleanup errors
      }
    });
  }
};

const createCanvasFromWarp = (cv, image, points) => {
  const source = cv.imread(image);
  const sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    points[0].x,
    points[0].y,
    points[1].x,
    points[1].y,
    points[2].x,
    points[2].y,
    points[3].x,
    points[3].y,
  ]);
  const width = Math.max(
    64,
    Math.round(
      Math.max(distance(points[0], points[1]), distance(points[2], points[3])),
    ),
  );
  const height = Math.max(
    64,
    Math.round(
      Math.max(distance(points[0], points[3]), distance(points[1], points[2])),
    ),
  );
  const destinationPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    width - 1,
    0,
    width - 1,
    height - 1,
    0,
    height - 1,
  ]);
  const transform = cv.getPerspectiveTransform(sourcePoints, destinationPoints);
  const warped = new cv.Mat();

  try {
    cv.warpPerspective(
      source,
      warped,
      transform,
      new cv.Size(width, height),
      cv.INTER_LINEAR,
      cv.BORDER_REPLICATE,
      new cv.Scalar(),
    );

    const canvas = document.createElement("canvas");
    cv.imshow(canvas, warped);
    return canvas;
  } finally {
    source.delete();
    sourcePoints.delete();
    destinationPoints.delete();
    transform.delete();
    warped.delete();
  }
};

export const detectAndExtractDocumentWithOpenCv = async (
  image,
  documentType = "document",
) => {
  const cv = await getOpenCv();
  const attempts = getDetectorAttempts(documentType);
  let points = null;

  for (const attempt of attempts) {
    points = detectWithAttempt(cv, image, attempt, documentType);
    if (points) {
      break;
    }
  }

  if (!points) {
    throw new Error("OpenCV не смог определить контур документа");
  }

  return {
    corners: points,
    canvas: createCanvasFromWarp(cv, image, points),
  };
};


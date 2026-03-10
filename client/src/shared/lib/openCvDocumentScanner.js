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

const getDetectorAttempts = (documentType, { preview = false } = {}) => {
  if (documentType === "passport") {
    if (preview) {
      return [
        { maxDimension: 960, blur: 5, lower: 16, upper: 68, close: 5, minAreaRatio: 0.1 },
        { maxDimension: 800, blur: 5, lower: 10, upper: 48, close: 7, minAreaRatio: 0.07 },
      ];
    }

    return [
      { maxDimension: 1600, blur: 5, lower: 20, upper: 80, close: 5, minAreaRatio: 0.18 },
      { maxDimension: 1400, blur: 5, lower: 14, upper: 64, close: 7, minAreaRatio: 0.14 },
      { maxDimension: 1200, blur: 7, lower: 10, upper: 48, close: 9, minAreaRatio: 0.1 },
    ];
  }

  if (preview) {
    return [
      { maxDimension: 960, blur: 5, lower: 22, upper: 88, close: 5, minAreaRatio: 0.08 },
      { maxDimension: 800, blur: 5, lower: 14, upper: 56, close: 7, minAreaRatio: 0.06 },
    ];
  }

  return [
    { maxDimension: 1400, blur: 5, lower: 28, upper: 110, close: 5, minAreaRatio: 0.12 },
    { maxDimension: 1200, blur: 5, lower: 18, upper: 72, close: 7, minAreaRatio: 0.08 },
  ];
};

const scoreCandidate = ({
  points,
  area,
  totalArea,
  documentType,
  originalWidth,
  originalHeight,
}) => {
  const ratio = getLongShortRatio(points);
  const ratioPenalty =
    documentType === "passport"
      ? Math.abs(ratio - 1.42) * 0.12
      : Math.abs(ratio - 1.4) * 0.08;
  const borderPenalty = points.some(
    (point) =>
      point.x < originalWidth * 0.01 ||
      point.y < originalHeight * 0.01 ||
      point.x > originalWidth * 0.99 ||
      point.y > originalHeight * 0.99,
  )
    ? 0.02
    : 0;

  return area / totalArea - ratioPenalty - borderPenalty;
};

const pickContourCandidate = ({
  cv,
  contour,
  scaleX,
  scaleY,
  originalWidth,
  originalHeight,
}) => {
  const perimeter = cv.arcLength(contour, true);
  const approx = new cv.Mat();

  try {
    cv.approxPolyDP(contour, approx, Math.max(8, perimeter * 0.02), true);

    if (approx.rows === 4 && cv.isContourConvex(approx)) {
      return normalizePoints(
        matPointsToArray(approx),
        scaleX,
        scaleY,
        originalWidth,
        originalHeight,
      );
    }

    const rect = cv.minAreaRect(contour);
    return normalizePoints(
      cv.RotatedRect.points(rect),
      scaleX,
      scaleY,
      originalWidth,
      originalHeight,
    );
  } finally {
    approx.delete();
  }
};

const collectBestCandidateFromMask = ({
  cv,
  mask,
  originalWidth,
  originalHeight,
  workingWidth,
  workingHeight,
  minArea,
  weakMinArea,
  documentType,
}) => {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const scaleX = originalWidth / workingWidth;
  const scaleY = originalHeight / workingHeight;
  let bestStrong = null;
  let bestWeak = null;

  try {
    cv.findContours(mask, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);

      try {
        const area = cv.contourArea(contour);
        if (!Number.isFinite(area) || area < weakMinArea) {
          continue;
        }

        const points = pickContourCandidate({
          cv,
          contour,
          scaleX,
          scaleY,
          originalWidth,
          originalHeight,
        });

        if (!points) {
          continue;
        }

        const score = scoreCandidate({
          points,
          area,
          totalArea: workingWidth * workingHeight,
          documentType,
          originalWidth,
          originalHeight,
        });
        const candidate = { score, points, area };

        if (area >= minArea && (!bestStrong || score > bestStrong.score)) {
          bestStrong = candidate;
        }

        if (!bestWeak || score > bestWeak.score) {
          bestWeak = candidate;
        }
      } finally {
        contour.delete();
      }
    }
  } finally {
    contours.delete();
    hierarchy.delete();
  }

  return { bestStrong, bestWeak };
};

const detectWithAttempt = (cv, image, attempt, documentType, options = {}) => {
  const allocated = [];
  const allocate = (mat) => {
    allocated.push(mat);
    return mat;
  };
  const { allowWeak = false } = options;

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
    const binary = allocate(new cv.Mat());
    const binaryClosed = allocate(new cv.Mat());
    const inverseBinary = allocate(new cv.Mat());
    const inverseBinaryClosed = allocate(new cv.Mat());
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
    cv.threshold(normalized, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.threshold(
      normalized,
      inverseBinary,
      0,
      255,
      cv.THRESH_BINARY_INV + cv.THRESH_OTSU,
    );
    cv.morphologyEx(binary, binaryClosed, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(inverseBinary, inverseBinaryClosed, cv.MORPH_CLOSE, kernel);

    const minArea = closed.cols * closed.rows * attempt.minAreaRatio;
    const weakMinArea = Math.max(
      closed.cols * closed.rows * (options.preview ? 0.02 : attempt.minAreaRatio * 0.5),
      600,
    );
    const masks = [closed, binaryClosed, inverseBinaryClosed];
    let bestStrong = null;
    let bestWeak = null;

    masks.forEach((mask) => {
      const result = collectBestCandidateFromMask({
        cv,
        mask,
        originalWidth: original.cols,
        originalHeight: original.rows,
        workingWidth: working.cols,
        workingHeight: working.rows,
        minArea,
        weakMinArea,
        documentType,
      });

      if (result.bestStrong && (!bestStrong || result.bestStrong.score > bestStrong.score)) {
        bestStrong = result.bestStrong;
      }

      if (result.bestWeak && (!bestWeak || result.bestWeak.score > bestWeak.score)) {
        bestWeak = result.bestWeak;
      }
    });

    const winner = bestStrong || (allowWeak ? bestWeak : null);
    if (!winner) {
      return null;
    }

    return winner.points;
  } finally {
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

export const detectDocumentCornersWithOpenCv = async (
  image,
  documentType = "document",
  options = {},
) => {
  const cv = await getOpenCv();
  const attempts = getDetectorAttempts(documentType, options);
  let points = null;
  const detectorOptions = {
    preview: Boolean(options.preview),
    allowWeak: Boolean(options.preview || options.allowWeak),
  };

  for (const attempt of attempts) {
    points = detectWithAttempt(cv, image, attempt, documentType, detectorOptions);
    if (points) {
      break;
    }
  }

  if (!points) {
    throw new Error("OpenCV не смог определить контур документа");
  }

  return points;
};

export const detectAndExtractDocumentWithOpenCv = async (
  image,
  documentType = "document",
) => {
  const points = await detectDocumentCornersWithOpenCv(image, documentType);

  return {
    corners: points,
    canvas: createCanvasFromWarp(await getOpenCv(), image, points),
  };
};

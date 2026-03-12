const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const BASE_VIDEO_CONSTRAINTS = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

export const captureLayoutByMode = {
  passport: {
    helperText:
      "Наведите камеру на разворот паспорта и держите телефон параллельно документу.",
    viewportAspect: 4 / 3,
    frameWidth: 0.9,
    frameHeight: 0.64,
    cropPadding: 0.06,
    previewMaxDimension: 420,
  },
  document: {
    helperText: "Поместите документ целиком в кадр и избегайте бликов.",
    viewportAspect: 3 / 4,
    frameWidth: 0.78,
    frameHeight: 0.68,
    cropPadding: 0.05,
    previewMaxDimension: 420,
  },
};

const loadImage = (dataUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось открыть снимок"));
    image.src = dataUrl;
  });

export const canvasToBlob = (canvas, mimeType = "image/jpeg", quality = 0.94) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Не удалось подготовить снимок"));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });

export const dataUrlToBlob = async (dataUrl) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

export const normalizeScanCorners = (corners = []) => {
  if (!Array.isArray(corners) || corners.length !== 4) {
    return null;
  }

  const normalized = corners.map((point) => ({
    x: clamp(Number(point?.x) / 1000, 0, 1),
    y: clamp(Number(point?.y) / 1000, 0, 1),
  }));

  return normalized.every(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
  )
    ? normalized
    : null;
};

export const computeVisibleSourceRect = (
  sourceWidth,
  sourceHeight,
  viewportAspect,
) => {
  const sourceAspect = sourceWidth / sourceHeight;
  if (sourceAspect > viewportAspect) {
    const visibleWidth = sourceHeight * viewportAspect;
    return {
      x: (sourceWidth - visibleWidth) / 2,
      y: 0,
      width: visibleWidth,
      height: sourceHeight,
    };
  }

  const visibleHeight = sourceWidth / viewportAspect;
  return {
    x: 0,
    y: (sourceHeight - visibleHeight) / 2,
    width: sourceWidth,
    height: visibleHeight,
  };
};

export const buildVisiblePreviewCanvas = (
  video,
  viewportAspect,
  maxDimension,
) => {
  const sourceWidth = video.videoWidth || 0;
  const sourceHeight = video.videoHeight || 0;
  if (!sourceWidth || !sourceHeight) {
    return null;
  }

  const visibleRect = computeVisibleSourceRect(
    sourceWidth,
    sourceHeight,
    viewportAspect,
  );
  const scale = Math.min(
    1,
    maxDimension / Math.max(visibleRect.width, visibleRect.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(visibleRect.width * scale));
  canvas.height = Math.max(1, Math.round(visibleRect.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return null;
  }

  context.drawImage(
    video,
    visibleRect.x,
    visibleRect.y,
    visibleRect.width,
    visibleRect.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return { canvas, visibleRect };
};

export const captureVisibleFrameDataUrl = (
  video,
  viewportAspect,
  mimeType = "image/jpeg",
  quality = 0.98,
) => {
  const sourceWidth = video.videoWidth || 0;
  const sourceHeight = video.videoHeight || 0;
  if (!sourceWidth || !sourceHeight) {
    return null;
  }

  const visibleRect = computeVisibleSourceRect(
    sourceWidth,
    sourceHeight,
    viewportAspect,
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(visibleRect.width));
  canvas.height = Math.max(1, Math.round(visibleRect.height));
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return null;
  }

  context.drawImage(
    video,
    visibleRect.x,
    visibleRect.y,
    visibleRect.width,
    visibleRect.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return canvas.toDataURL(mimeType, quality);
};

export const captureSourceFrameDataUrl = (
  video,
  mimeType = "image/jpeg",
  quality = 0.98,
) => {
  const sourceWidth = video.videoWidth || 0;
  const sourceHeight = video.videoHeight || 0;
  if (!sourceWidth || !sourceHeight) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, sourceWidth, sourceHeight);
  return canvas.toDataURL(mimeType, quality);
};

const toGrayscale = (imageData) => {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);

  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    gray[pixel] = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
  }

  return gray;
};

const smoothScores = (scores, radius = 4) =>
  scores.map((_, index) => {
    let total = 0;
    let count = 0;

    for (
      let sampleIndex = Math.max(0, index - radius);
      sampleIndex <= Math.min(scores.length - 1, index + radius);
      sampleIndex += 1
    ) {
      total += scores[sampleIndex];
      count += 1;
    }

    return count > 0 ? total / count : 0;
  });

const average = (values) =>
  values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

const percentile = (values, ratio) => {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = clamp(
    Math.round((sorted.length - 1) * ratio),
    0,
    sorted.length - 1,
  );
  return sorted[index];
};

const positionWeight = (index, expected, range) => {
  const distance = Math.abs(index - expected);
  const safeRange = Math.max(1, range);
  return 1 - Math.min(0.45, distance / safeRange);
};

const pickPeak = (scores, from, to, expected) => {
  const start = Math.max(0, Math.min(from, scores.length - 1));
  const end = Math.max(start + 1, Math.min(to, scores.length));
  const slice = scores.slice(start, end);
  const baseline = average(slice);
  let bestIndex = start;
  let bestValue = 0;

  for (let index = start; index < end; index += 1) {
    const weighted = scores[index] * positionWeight(index, expected, end - start);
    if (weighted > bestValue) {
      bestValue = weighted;
      bestIndex = index;
    }
  }

  return {
    index: bestIndex,
    score: bestValue,
    baseline,
  };
};

const buildColumnScores = (gray, width, height, startY, endY) => {
  const scores = new Float32Array(width);

  for (let x = 1; x < width; x += 1) {
    let total = 0;
    for (let y = startY; y < endY; y += 1) {
      const current = gray[y * width + x];
      const previous = gray[y * width + x - 1];
      total += Math.abs(current - previous);
    }
    scores[x] = total / Math.max(1, endY - startY);
  }

  return smoothScores(Array.from(scores), 5);
};

const buildRowScores = (gray, width, height, startX, endX) => {
  const scores = new Float32Array(height);

  for (let y = 1; y < height; y += 1) {
    let total = 0;
    for (let x = startX; x < endX; x += 1) {
      const current = gray[y * width + x];
      const previous = gray[(y - 1) * width + x];
      total += Math.abs(current - previous);
    }
    scores[y] = total / Math.max(1, endX - startX);
  }

  return smoothScores(Array.from(scores), 5);
};

const isValidQuad = (corners, width, height) => {
  const topWidth = corners[1].x - corners[0].x;
  const bottomWidth = corners[2].x - corners[3].x;
  const leftHeight = corners[3].y - corners[0].y;
  const rightHeight = corners[2].y - corners[1].y;

  return (
    topWidth > width * 0.24 &&
    bottomWidth > width * 0.24 &&
    leftHeight > height * 0.24 &&
    rightHeight > height * 0.24
  );
};

const detectPassportQuad = (gray, width, height, layout) => {
  const frameLeft = Math.round(width * (1 - layout.frameWidth) * 0.5);
  const frameRight = Math.round(width * (1 - (1 - layout.frameWidth) * 0.5));
  const frameTop = Math.round(height * (1 - layout.frameHeight) * 0.5);
  const frameBottom = Math.round(height * (1 - (1 - layout.frameHeight) * 0.5));
  const roiLeft = Math.max(0, frameLeft - Math.round(width * 0.04));
  const roiRight = Math.min(width, frameRight + Math.round(width * 0.04));
  const roiTop = Math.max(0, frameTop - Math.round(height * 0.04));
  const roiBottom = Math.min(height, frameBottom + Math.round(height * 0.04));
  const samples = [];

  for (let y = roiTop; y < roiBottom; y += 2) {
    for (let x = roiLeft; x < roiRight; x += 2) {
      samples.push(gray[y * width + x]);
    }
  }

  const darkThreshold = percentile(samples, 0.3);
  const columnDarkRatio = new Array(width).fill(0);
  const rowDarkRatio = new Array(height).fill(0);
  const roiHeight = Math.max(1, roiBottom - roiTop);
  const roiWidth = Math.max(1, roiRight - roiLeft);

  for (let x = roiLeft; x < roiRight; x += 1) {
    let darkPixels = 0;
    for (let y = roiTop; y < roiBottom; y += 1) {
      if (gray[y * width + x] <= darkThreshold) {
        darkPixels += 1;
      }
    }
    columnDarkRatio[x] = darkPixels / roiHeight;
  }

  for (let y = roiTop; y < roiBottom; y += 1) {
    let darkPixels = 0;
    for (let x = roiLeft; x < roiRight; x += 1) {
      if (gray[y * width + x] <= darkThreshold) {
        darkPixels += 1;
      }
    }
    rowDarkRatio[y] = darkPixels / roiWidth;
  }

  const minColumnRatio = 0.18;
  const minRowRatio = 0.16;
  let left = -1;
  let right = -1;
  let top = -1;
  let bottom = -1;

  for (let x = roiLeft; x < roiRight; x += 1) {
    if (columnDarkRatio[x] >= minColumnRatio) {
      left = x;
      break;
    }
  }

  for (let x = roiRight - 1; x >= roiLeft; x -= 1) {
    if (columnDarkRatio[x] >= minColumnRatio) {
      right = x;
      break;
    }
  }

  for (let y = roiTop; y < roiBottom; y += 1) {
    if (rowDarkRatio[y] >= minRowRatio) {
      top = y;
      break;
    }
  }

  for (let y = roiBottom - 1; y >= roiTop; y -= 1) {
    if (rowDarkRatio[y] >= minRowRatio) {
      bottom = y;
      break;
    }
  }

  if (left === -1 || right === -1 || top === -1 || bottom === -1) {
    return null;
  }

  const quad = [
    { x: left / width, y: top / height },
    { x: right / width, y: top / height },
    { x: right / width, y: bottom / height },
    { x: left / width, y: bottom / height },
  ];

  const pixelQuad = quad.map((point) => ({
    x: point.x * width,
    y: point.y * height,
  }));

  if (!isValidQuad(pixelQuad, width, height)) {
    return null;
  }

  const areaRatio =
    ((right - left) * (bottom - top)) / Math.max(1, width * height);
  if (areaRatio < 0.16) {
    return null;
  }

  return {
    corners: quad,
    confidence: clamp(areaRatio * 2.2, 0, 1),
  };
};

export const detectDocumentQuad = (canvas, layout, mode = "document") => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const gray = toGrayscale(imageData);
  const width = canvas.width;
  const height = canvas.height;

  if (mode === "passport") {
    const passportQuad = detectPassportQuad(gray, width, height, layout);
    if (passportQuad) {
      return passportQuad;
    }
  }

  const frameLeft = (1 - layout.frameWidth) / 2;
  const frameTop = (1 - layout.frameHeight) / 2;
  const leftTarget = Math.round(width * frameLeft);
  const rightTarget = Math.round(width * (1 - frameLeft));
  const topTarget = Math.round(height * frameTop);
  const bottomTarget = Math.round(height * (1 - frameTop));
  const topHalfStart = Math.round(height * 0.1);
  const topHalfEnd = Math.round(height * 0.56);
  const bottomHalfStart = Math.round(height * 0.44);
  const bottomHalfEnd = Math.round(height * 0.9);
  const leftHalfStart = Math.round(width * 0.08);
  const leftHalfEnd = Math.round(width * 0.56);
  const rightHalfStart = Math.round(width * 0.44);
  const rightHalfEnd = Math.round(width * 0.92);

  const leftTopScores = buildColumnScores(gray, width, height, topHalfStart, topHalfEnd);
  const leftBottomScores = buildColumnScores(gray, width, height, bottomHalfStart, bottomHalfEnd);
  const topLeftScores = buildRowScores(gray, width, height, leftHalfStart, leftHalfEnd);
  const topRightScores = buildRowScores(gray, width, height, rightHalfStart, rightHalfEnd);

  const leftTop = pickPeak(leftTopScores, Math.round(width * 0.06), Math.round(width * 0.45), leftTarget);
  const leftBottom = pickPeak(
    leftBottomScores,
    Math.round(width * 0.06),
    Math.round(width * 0.48),
    leftTarget,
  );
  const rightTop = pickPeak(
    leftTopScores,
    Math.round(width * 0.52),
    Math.round(width * 0.96),
    rightTarget,
  );
  const rightBottom = pickPeak(
    leftBottomScores,
    Math.round(width * 0.52),
    Math.round(width * 0.96),
    rightTarget,
  );
  const topLeft = pickPeak(topLeftScores, Math.round(height * 0.05), Math.round(height * 0.42), topTarget);
  const topRight = pickPeak(topRightScores, Math.round(height * 0.05), Math.round(height * 0.42), topTarget);
  const bottomLeft = pickPeak(
    topLeftScores,
    Math.round(height * 0.58),
    Math.round(height * 0.95),
    bottomTarget,
  );
  const bottomRight = pickPeak(
    topRightScores,
    Math.round(height * 0.58),
    Math.round(height * 0.95),
    bottomTarget,
  );

  const corners = [
    { x: leftTop.index / width, y: topLeft.index / height },
    { x: rightTop.index / width, y: topRight.index / height },
    { x: rightBottom.index / width, y: bottomRight.index / height },
    { x: leftBottom.index / width, y: bottomLeft.index / height },
  ];

  if (!isValidQuad(corners.map((point) => ({
    x: point.x * width,
    y: point.y * height,
  })), width, height)) {
    return null;
  }

  const ratios = [
    leftTop.score / Math.max(1, leftTop.baseline),
    leftBottom.score / Math.max(1, leftBottom.baseline),
    rightTop.score / Math.max(1, rightTop.baseline),
    rightBottom.score / Math.max(1, rightBottom.baseline),
    topLeft.score / Math.max(1, topLeft.baseline),
    topRight.score / Math.max(1, topRight.baseline),
    bottomLeft.score / Math.max(1, bottomLeft.baseline),
    bottomRight.score / Math.max(1, bottomRight.baseline),
  ];
  const confidence = average(ratios) / 3;

  if (confidence < 0.92) {
    return null;
  }

  return {
    corners,
    confidence: clamp(confidence, 0, 1),
  };
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const estimateOutputSize = (corners) => {
  const top = distance(corners[0], corners[1]);
  const right = distance(corners[1], corners[2]);
  const bottom = distance(corners[2], corners[3]);
  const left = distance(corners[3], corners[0]);

  return {
    width: Math.max(64, Math.round(Math.max(top, bottom))),
    height: Math.max(64, Math.round(Math.max(left, right))),
  };
};

const solveLinearSystem = (matrix, vector) => {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot;

    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) {
        maxRow = row;
      }
    }

    if (Math.abs(augmented[maxRow][pivot]) < 1e-8) {
      return null;
    }

    if (maxRow !== pivot) {
      [augmented[pivot], augmented[maxRow]] = [augmented[maxRow], augmented[pivot]];
    }

    const pivotValue = augmented[pivot][pivot];
    for (let column = pivot; column <= size; column += 1) {
      augmented[pivot][column] /= pivotValue;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }

      const factor = augmented[row][pivot];
      if (factor === 0) {
        continue;
      }

      for (let column = pivot; column <= size; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }

  return augmented.map((row) => row[size]);
};

const buildProjectiveTransform = (sourceCorners, outputWidth, outputHeight) => {
  const destinationCorners = [
    { x: 0, y: 0 },
    { x: outputWidth - 1, y: 0 },
    { x: outputWidth - 1, y: outputHeight - 1 },
    { x: 0, y: outputHeight - 1 },
  ];
  const matrix = [];
  const vector = [];

  for (let index = 0; index < 4; index += 1) {
    const { x: u, y: v } = destinationCorners[index];
    const { x, y } = sourceCorners[index];

    matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    vector.push(x);
    matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    vector.push(y);
  }

  const solution = solveLinearSystem(matrix, vector);
  if (!solution) {
    return null;
  }

  return [
    solution[0],
    solution[1],
    solution[2],
    solution[3],
    solution[4],
    solution[5],
    solution[6],
    solution[7],
    1,
  ];
};

const projectPoint = (transform, x, y) => {
  const denominator = transform[6] * x + transform[7] * y + transform[8];
  if (Math.abs(denominator) < 1e-8) {
    return null;
  }

  return {
    x: (transform[0] * x + transform[1] * y + transform[2]) / denominator,
    y: (transform[3] * x + transform[4] * y + transform[5]) / denominator,
  };
};

const sampleRgba = (src, srcWidth, srcHeight, x, y) => {
  const fx = clamp(x, 0, srcWidth - 1);
  const fy = clamp(y, 0, srcHeight - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(srcWidth - 1, x0 + 1);
  const y1 = Math.min(srcHeight - 1, y0 + 1);
  const dx = fx - x0;
  const dy = fy - y0;

  const idx00 = (y0 * srcWidth + x0) * 4;
  const idx10 = (y0 * srcWidth + x1) * 4;
  const idx01 = (y1 * srcWidth + x0) * 4;
  const idx11 = (y1 * srcWidth + x1) * 4;

  const top = [0, 1, 2, 3].map(
    (offset) => src[idx00 + offset] + (src[idx10 + offset] - src[idx00 + offset]) * dx,
  );
  const bottom = [0, 1, 2, 3].map(
    (offset) => src[idx01 + offset] + (src[idx11 + offset] - src[idx01 + offset]) * dx,
  );

  return top.map((value, index) =>
    Math.round(value + (bottom[index] - value) * dy),
  );
};

const warpQuad = (source, corners) => {
  const { width, height } = estimateOutputSize(corners);
  const output = new ImageData(width, height);
  const { data: src, width: srcWidth, height: srcHeight } = source;
  const transform = buildProjectiveTransform(corners, width, height);

  if (!transform) {
    throw new Error("Не удалось выровнять документ по найденному контуру");
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const mapped = projectPoint(transform, x, y);
      if (!mapped) {
        continue;
      }

      const [r, g, b, a] = sampleRgba(src, srcWidth, srcHeight, mapped.x, mapped.y);
      const idx = (y * width + x) * 4;
      output.data[idx] = r;
      output.data[idx + 1] = g;
      output.data[idx + 2] = b;
      output.data[idx + 3] = a;
    }
  }

  return output;
};

const percentileChannelBounds = (imageData, clipRatio = 0.01) => {
  const histogram = new Uint32Array(256);
  const { data } = imageData;
  const pixelCount = data.length / 4;

  for (let index = 0; index < data.length; index += 4) {
    const luminance = Math.round(
      data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114,
    );
    histogram[luminance] += 1;
  }

  const clipPixels = Math.max(1, Math.floor(pixelCount * clipRatio));
  let low = 0;
  let acc = 0;
  while (low < 255 && acc < clipPixels) {
    acc += histogram[low];
    low += 1;
  }

  let high = 255;
  acc = 0;
  while (high > 0 && acc < clipPixels) {
    acc += histogram[high];
    high -= 1;
  }

  if (high <= low) {
    return { low: 0, high: 255 };
  }

  return { low, high };
};

const normalizeChannel = (value, low, high) => {
  const stretched = ((value - low) * 255) / Math.max(1, high - low);
  return clamp(Math.round(stretched), 0, 255);
};

const enhanceScanLikeAppearance = (imageData) => {
  const { data } = imageData;
  const { low, high } = percentileChannelBounds(imageData, 0.0125);

  for (let index = 0; index < data.length; index += 4) {
    const r = normalizeChannel(data[index], low, high);
    const g = normalizeChannel(data[index + 1], low, high);
    const b = normalizeChannel(data[index + 2], low, high);
    const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);

    data[index] = clamp(Math.round(r * 0.82 + gray * 0.18), 0, 255);
    data[index + 1] = clamp(Math.round(g * 0.82 + gray * 0.18), 0, 255);
    data[index + 2] = clamp(Math.round(b * 0.82 + gray * 0.18), 0, 255);
  }

  return imageData;
};

const enhanceCanvasForScan = (canvas) => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas недоступен для улучшения снимка");
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  enhanceScanLikeAppearance(imageData);
  context.putImageData(imageData, 0, 0);
  return canvas;
};

const buildGuideCropBlob = async (image, layout, viewportAspect) => {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const visibleRect = computeVisibleSourceRect(
    sourceWidth,
    sourceHeight,
    viewportAspect,
  );
  const frameLeft = (1 - layout.frameWidth) / 2;
  const frameTop = (1 - layout.frameHeight) / 2;
  const padding = Math.min(visibleRect.width, visibleRect.height) * layout.cropPadding;

  const cropX = Math.max(0, visibleRect.x + visibleRect.width * frameLeft - padding);
  const cropY = Math.max(0, visibleRect.y + visibleRect.height * frameTop - padding);
  const cropRight = Math.min(
    sourceWidth,
    visibleRect.x + visibleRect.width * (frameLeft + layout.frameWidth) + padding,
  );
  const cropBottom = Math.min(
    sourceHeight,
    visibleRect.y + visibleRect.height * (frameTop + layout.frameHeight) + padding,
  );
  const cropWidth = Math.max(64, Math.round(cropRight - cropX));
  const cropHeight = Math.max(64, Math.round(cropBottom - cropY));
  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas недоступен для кадрирования снимка");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  enhanceCanvasForScan(canvas);
  return canvasToBlob(canvas);
};

const buildWarpedCaptureBlob = async (image, normalizedCorners, viewportAspect) => {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const visibleRect = computeVisibleSourceRect(
    sourceWidth,
    sourceHeight,
    viewportAspect,
  );
  const sourceCorners = normalizedCorners.map((point) => ({
    x: visibleRect.x + visibleRect.width * point.x,
    y: visibleRect.y + visibleRect.height * point.y,
  }));
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceContext = sourceCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!sourceContext) {
    throw new Error("Canvas недоступен для подготовки снимка");
  }

  sourceContext.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  const sourceImageData = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight);
  const warped = warpQuad(sourceImageData, sourceCorners);
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = warped.width;
  outputCanvas.height = warped.height;
  const outputContext = outputCanvas.getContext("2d");

  if (!outputContext) {
    throw new Error("Canvas недоступен для сборки снимка");
  }

  outputContext.putImageData(warped, 0, 0);
  enhanceCanvasForScan(outputCanvas);
  return canvasToBlob(outputCanvas);
};

export const prepareCaptureBlob = async ({
  dataUrl,
  normalizedCorners,
  viewportAspect,
  layout,
}) => {
  const image = await loadImage(dataUrl);

  if (Array.isArray(normalizedCorners) && normalizedCorners.length === 4) {
    try {
      return await buildWarpedCaptureBlob(image, normalizedCorners, viewportAspect);
    } catch {
      // Fallback to guide crop if perspective warp failed.
    }
  }

  return buildGuideCropBlob(image, layout, viewportAspect);
};

export const createPreviewUrl = (blob) => URL.createObjectURL(blob);

export { clamp };

import ocrService from "@/services/ocrService";
import { scanDocument as scanicScanDocument } from "scanic";

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
  const out = new ImageData(width, height);
  const { data: src, width: srcWidth, height: srcHeight } = source;
  const transform = buildProjectiveTransform(corners, width, height);
  if (!transform) {
    throw new Error("Не удалось вычислить перспективное преобразование документа");
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const mapped = projectPoint(transform, x, y);
      if (!mapped) {
        continue;
      }
      const [r, g, b, a] = sampleRgba(src, srcWidth, srcHeight, mapped.x, mapped.y);
      const idx = (y * width + x) * 4;
      out.data[idx] = r;
      out.data[idx + 1] = g;
      out.data[idx + 2] = b;
      out.data[idx + 3] = a;
    }
  }

  return out;
};

const percentileChannelBounds = (imageData, clipRatio = 0.01) => {
  const histogram = new Uint32Array(256);
  const { data } = imageData;
  const pixelCount = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const luminance = Math.round(
      data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114,
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

  for (let i = 0; i < data.length; i += 4) {
    const r = normalizeChannel(data[i], low, high);
    const g = normalizeChannel(data[i + 1], low, high);
    const b = normalizeChannel(data[i + 2], low, high);
    const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);

    // Mild blend toward grayscale makes the photo feel closer to a clean scan
    // without destroying colored security marks on documents.
    data[i] = clamp(Math.round(r * 0.82 + gray * 0.18), 0, 255);
    data[i + 1] = clamp(Math.round(g * 0.82 + gray * 0.18), 0, 255);
    data[i + 2] = clamp(Math.round(b * 0.82 + gray * 0.18), 0, 255);
  }

  return imageData;
};

const loadImageFromFile = (file) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось загрузить изображение"));
    };
    image.src = url;
  });

const toPixelCorners = (corners, width, height) =>
  corners.map((point) => ({
    x: clamp((Number(point.x) / 1000) * width, 0, width - 1),
    y: clamp((Number(point.y) / 1000) * height, 0, height - 1),
  }));

const canvasToBlob = (canvas, mimeType = "image/jpeg", quality = 0.92) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Не удалось сформировать scan-копию"));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });

const processCanvasToScanFile = async (canvas, fileNameBase) => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas недоступен для сборки scan-копии");
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  enhanceScanLikeAppearance(imageData);
  context.putImageData(imageData, 0, 0);

  const blob = await canvasToBlob(canvas);

  return new File([blob], `${fileNameBase}-scan.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
};

const createScanWithScanic = async (image, fileNameBase) => {
  const result = await scanicScanDocument(image, {
    mode: "extract",
    output: "canvas",
    maxProcessingDimension: 1600,
    minArea: 4000,
  });

  if (!result?.success || !result.output) {
    throw new Error(result?.message || "Локальный detector не нашел документ");
  }

  return processCanvasToScanFile(result.output, fileNameBase);
};

export const createAiScannedDocument = async ({
  file,
  documentType,
}) => {
  const fileNameBase = String(file.name || "document")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.-]+/g, "_");
  const image = await loadImageFromFile(file);

  try {
    return await createScanWithScanic(image, fileNameBase);
  } catch (scanicError) {
    console.warn("Scanic fallback to OCR scan:", scanicError);
  }

  const response = await ocrService.scanDocument({ file, documentType });

  const payload = response?.data || response || {};
  const normalized = payload?.normalized || {};
  if (
    !normalized?.detected ||
    !Array.isArray(normalized?.corners) ||
    normalized.corners.length !== 4
  ) {
    throw new Error("AI не смог уверенно определить границы документа");
  }

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.naturalWidth || image.width;
  sourceCanvas.height = image.naturalHeight || image.height;
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceCtx) {
    throw new Error("Canvas недоступен для AI scan");
  }

  sourceCtx.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);
  const sourceImageData = sourceCtx.getImageData(
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  );
  const warped = warpQuad(
    sourceImageData,
    toPixelCorners(normalized.corners, sourceCanvas.width, sourceCanvas.height),
  );
  enhanceScanLikeAppearance(warped);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = warped.width;
  outputCanvas.height = warped.height;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) {
    throw new Error("Canvas недоступен для сборки scan-копии");
  }

  outputCtx.putImageData(warped, 0, 0);

  return processCanvasToScanFile(outputCanvas, fileNameBase);
};

export default createAiScannedDocument;

import { defaultQuad } from "./math";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const toGrayscale = (rgba, out) => {
  for (let i = 0, g = 0; i < rgba.length; i += 4, g += 1) {
    out[g] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  }
};

const boxBlur3 = (src, out, width, height) => {
  for (let y = 0; y < height; y += 1) {
    const y0 = y > 0 ? y - 1 : y;
    const y2 = y < height - 1 ? y + 1 : y;
    for (let x = 0; x < width; x += 1) {
      const x0 = x > 0 ? x - 1 : x;
      const x2 = x < width - 1 ? x + 1 : x;
      const sum =
        src[y0 * width + x0] + src[y0 * width + x] + src[y0 * width + x2] +
        src[y * width + x0] + src[y * width + x] + src[y * width + x2] +
        src[y2 * width + x0] + src[y2 * width + x] + src[y2 * width + x2];
      out[y * width + x] = (sum / 9) | 0;
    }
  }
};

const otsuThreshold = (gray) => {
  const histogram = new Int32Array(256);
  for (let i = 0; i < gray.length; i += 1) histogram[gray[i]] += 1;

  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i];

  let sumBg = 0;
  let wBg = 0;
  let maxVar = -1;
  let threshold = 127;
  const total = gray.length;

  for (let t = 0; t < 256; t += 1) {
    wBg += histogram[t];
    if (wBg === 0) continue;
    const wFg = total - wBg;
    if (wFg === 0) break;
    sumBg += t * histogram[t];
    const meanBg = sumBg / wBg;
    const meanFg = (sum - sumBg) / wFg;
    const between = wBg * wFg * (meanBg - meanFg) ** 2;
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }

  return threshold;
};

const buildMask = (gray, out, width, height, threshold, brightDocument) => {
  const size = width * height;
  let count = 0;

  for (let i = 0; i < size; i += 1) {
    const active = brightDocument ? gray[i] >= threshold : gray[i] <= threshold;
    out[i] = active ? 1 : 0;
    count += out[i];
  }

  const ratio = count / size;
  if (ratio > 0.93 || ratio < 0.05) {
    for (let i = 0; i < size; i += 1) {
      const active = brightDocument ? gray[i] >= threshold + 14 : gray[i] <= threshold - 14;
      out[i] = active ? 1 : 0;
    }
  }
};

const dilate3 = (src, out, width, height) => {
  for (let y = 0; y < height; y += 1) {
    const y0 = y > 0 ? y - 1 : y;
    const y2 = y < height - 1 ? y + 1 : y;
    for (let x = 0; x < width; x += 1) {
      const x0 = x > 0 ? x - 1 : x;
      const x2 = x < width - 1 ? x + 1 : x;
      let on = 0;
      for (let yy = y0; yy <= y2 && on === 0; yy += 1) {
        for (let xx = x0; xx <= x2; xx += 1) {
          if (src[yy * width + xx] === 1) {
            on = 1;
            break;
          }
        }
      }
      out[y * width + x] = on;
    }
  }
};

const erode3 = (src, out, width, height) => {
  for (let y = 0; y < height; y += 1) {
    const y0 = y > 0 ? y - 1 : y;
    const y2 = y < height - 1 ? y + 1 : y;
    for (let x = 0; x < width; x += 1) {
      const x0 = x > 0 ? x - 1 : x;
      const x2 = x < width - 1 ? x + 1 : x;
      let on = 1;
      for (let yy = y0; yy <= y2 && on === 1; yy += 1) {
        for (let xx = x0; xx <= x2; xx += 1) {
          if (src[yy * width + xx] === 0) {
            on = 0;
            break;
          }
        }
      }
      out[y * width + x] = on;
    }
  }
};

const morphClose = (mask, temp, width, height) => {
  dilate3(mask, temp, width, height);
  erode3(temp, mask, width, height);
};

const detectComponent = (mask, visited, queue, width, height) => {
  visited.fill(0);
  const total = width * height;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const maxDist = Math.hypot(cx, cy);

  let bestScore = 0;
  let bestCorners = defaultQuad(width, height);
  let bestConfidence = 0;

  for (let i = 0; i < total; i += 1) {
    if (mask[i] === 0 || visited[i] === 1) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    visited[i] = 1;

    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let minSum = Number.POSITIVE_INFINITY;
    let maxSum = Number.NEGATIVE_INFINITY;
    let minDiff = Number.POSITIVE_INFINITY;
    let maxDiff = Number.NEGATIVE_INFINITY;
    let tl = { x: 0, y: 0 };
    let tr = { x: width - 1, y: 0 };
    let br = { x: width - 1, y: height - 1 };
    let bl = { x: 0, y: height - 1 };

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % width;
      const y = (idx / width) | 0;
      area += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const sum = x + y;
      const diff = x - y;
      if (sum < minSum) { minSum = sum; tl = { x, y }; }
      if (sum > maxSum) { maxSum = sum; br = { x, y }; }
      if (diff > maxDiff) { maxDiff = diff; tr = { x, y }; }
      if (diff < minDiff) { minDiff = diff; bl = { x, y }; }

      const x0 = x > 0 ? x - 1 : x;
      const x2 = x < width - 1 ? x + 1 : x;
      const y0 = y > 0 ? y - 1 : y;
      const y2 = y < height - 1 ? y + 1 : y;
      for (let yy = y0; yy <= y2; yy += 1) {
        for (let xx = x0; xx <= x2; xx += 1) {
          const nextIdx = yy * width + xx;
          if (mask[nextIdx] === 1 && visited[nextIdx] === 0) {
            visited[nextIdx] = 1;
            queue[tail++] = nextIdx;
          }
        }
      }
    }

    const boxArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
    const fillRatio = area / boxArea;
    const areaRatio = area / total;
    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;
    const dist = Math.hypot(centerX - cx, centerY - cy) / maxDist;
    const centerScore = 1 - Math.min(1, dist);

    const score = areaRatio * 0.55 + fillRatio * 0.3 + centerScore * 0.15;
    const confidence = Math.max(0, Math.min(1, fillRatio * 0.55 + areaRatio * 1.4));

    if (score > bestScore) {
      bestScore = score;
      bestConfidence = confidence;
      bestCorners = [tl, tr, br, bl];
    }
  }

  return {
    corners: bestCorners,
    confidence: bestConfidence,
  };
};

export class DocumentDetector {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.gray = new Uint8Array(0);
    this.blur = new Uint8Array(0);
    this.maskA = new Uint8Array(0);
    this.maskB = new Uint8Array(0);
    this.visited = new Uint8Array(0);
    this.queue = new Int32Array(0);
  }

  ensureBuffers(width, height) {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    const size = width * height;
    this.gray = new Uint8Array(size);
    this.blur = new Uint8Array(size);
    this.maskA = new Uint8Array(size);
    this.maskB = new Uint8Array(size);
    this.visited = new Uint8Array(size);
    this.queue = new Int32Array(size);
  }

  detect(imageData) {
    const startedAt = now();
    const { width, height, data } = imageData;
    this.ensureBuffers(width, height);
    toGrayscale(data, this.gray);
    boxBlur3(this.gray, this.blur, width, height);
    const threshold = otsuThreshold(this.blur);
    buildMask(this.blur, this.maskA, width, height, threshold, true);
    morphClose(this.maskA, this.maskB, width, height);
    const bright = detectComponent(this.maskA, this.visited, this.queue, width, height);
    buildMask(this.blur, this.maskA, width, height, threshold, false);
    morphClose(this.maskA, this.maskB, width, height);
    const dark = detectComponent(this.maskA, this.visited, this.queue, width, height);
    const best = bright.confidence >= dark.confidence ? bright : dark;
    return {
      corners: best.corners,
      confidence: best.confidence,
      processingMs: now() - startedAt,
    };
  }
}

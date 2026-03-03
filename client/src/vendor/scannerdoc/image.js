import { clamp, distance } from "./math";

export const estimateOutputSize = (corners) => {
  const top = distance(corners[0], corners[1]);
  const right = distance(corners[1], corners[2]);
  const bottom = distance(corners[2], corners[3]);
  const left = distance(corners[3], corners[0]);

  return {
    width: Math.max(64, Math.round(Math.max(top, bottom))),
    height: Math.max(64, Math.round(Math.max(left, right))),
  };
};

const mapBilinearQuad = (u, v, tl, tr, br, bl) => {
  const a = (1 - u) * (1 - v);
  const b = u * (1 - v);
  const c = u * v;
  const d = (1 - u) * v;

  return {
    x: tl.x * a + tr.x * b + br.x * c + bl.x * d,
    y: tl.y * a + tr.y * b + br.y * c + bl.y * d,
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

  const top = [0, 1, 2, 3].map((offset) => src[idx00 + offset] + (src[idx10 + offset] - src[idx00 + offset]) * dx);
  const bottom = [0, 1, 2, 3].map((offset) => src[idx01 + offset] + (src[idx11 + offset] - src[idx01 + offset]) * dx);

  return top.map((value, index) => Math.round(value + (bottom[index] - value) * dy));
};

export const warpQuad = (source, corners, forcedWidth, forcedHeight) => {
  const { width: autoWidth, height: autoHeight } = estimateOutputSize(corners);
  const width = forcedWidth ?? autoWidth;
  const height = forcedHeight ?? autoHeight;
  const out = new ImageData(width, height);
  const { data: src, width: srcWidth, height: srcHeight } = source;

  for (let y = 0; y < height; y += 1) {
    const v = height === 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = width === 1 ? 0 : x / (width - 1);
      const mapped = mapBilinearQuad(u, v, corners[0], corners[1], corners[2], corners[3]);
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

const otsuFromHistogram = (histogram, total) => {
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i];

  let sumBg = 0;
  let wBg = 0;
  let maxVar = -1;
  let threshold = 127;

  for (let i = 0; i < 256; i += 1) {
    wBg += histogram[i];
    if (wBg === 0) continue;
    const wFg = total - wBg;
    if (wFg === 0) break;
    sumBg += i * histogram[i];
    const meanBg = sumBg / wBg;
    const meanFg = (sum - sumBg) / wFg;
    const between = wBg * wFg * (meanBg - meanFg) * (meanBg - meanFg);
    if (between > maxVar) {
      maxVar = between;
      threshold = i;
    }
  }

  return threshold;
};

export const applyFilter = (imageData, filter) => {
  if (filter === "color") return;

  const { data } = imageData;

  if (filter === "grayscale") {
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
    return;
  }

  const histogram = new Int32Array(256);
  const luma = new Uint8Array(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const gray = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    luma[p] = gray;
    histogram[gray] += 1;
  }

  const threshold = otsuFromHistogram(histogram, luma.length);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const value = luma[p] >= threshold ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
};

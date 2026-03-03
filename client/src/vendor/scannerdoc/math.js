export const clamp = (value, min, max) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export const lerp = (a, b, t) => a + (b - a) * t;

export const lerpPoint = (a, b, t) => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

export const smoothQuad = (previous, next, smoothing) => {
  const alpha = clamp(1 - smoothing, 0.05, 1);
  return [
    lerpPoint(previous[0], next[0], alpha),
    lerpPoint(previous[1], next[1], alpha),
    lerpPoint(previous[2], next[2], alpha),
    lerpPoint(previous[3], next[3], alpha),
  ];
};

export const distance = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
};

export const defaultQuad = (width, height) => {
  const padX = width * 0.1;
  const padY = height * 0.1;
  return [
    { x: padX, y: padY },
    { x: width - padX, y: padY },
    { x: width - padX, y: height - padY },
    { x: padX, y: height - padY },
  ];
};

const samePoint = (a, b) =>
  Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;

export const normalizeQuad = (candidate, width, height) => {
  const bounded = [
    { x: clamp(candidate[0].x, 0, width - 1), y: clamp(candidate[0].y, 0, height - 1) },
    { x: clamp(candidate[1].x, 0, width - 1), y: clamp(candidate[1].y, 0, height - 1) },
    { x: clamp(candidate[2].x, 0, width - 1), y: clamp(candidate[2].y, 0, height - 1) },
    { x: clamp(candidate[3].x, 0, width - 1), y: clamp(candidate[3].y, 0, height - 1) },
  ];

  if (
    samePoint(bounded[0], bounded[1]) ||
    samePoint(bounded[1], bounded[2]) ||
    samePoint(bounded[2], bounded[3]) ||
    samePoint(bounded[3], bounded[0])
  ) {
    return defaultQuad(width, height);
  }

  return bounded;
};

import { DocumentDetector } from "./detector";
import { warpQuad, applyFilter } from "./image";
import { clamp, defaultQuad, normalizeQuad, smoothQuad } from "./math";

const DEFAULT_INTERVAL_MS = 120;
const DEFAULT_DETECTION_WIDTH = 320;
const DEFAULT_SMOOTHING = 0.72;

const waitForEvent = (target, eventName, timeoutMs = 4000) =>
  new Promise((resolve, reject) => {
    let timeoutId = null;

    const cleanup = () => {
      target.removeEventListener(eventName, handleSuccess);
      target.removeEventListener("error", handleError);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };

    const handleSuccess = () => {
      cleanup();
      resolve();
    };

    const handleError = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(`Failed waiting for ${eventName}`));
    };

    target.addEventListener(eventName, handleSuccess, { once: true });
    target.addEventListener("error", handleError, { once: true });

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
  });

const toBlob = async (canvas, mimeType, quality) => {
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
  if (!blob) throw new Error("Failed to encode captured image");
  return blob;
};

const waitForVideoReady = async (video) => {
  if (video.videoWidth > 0 && video.videoHeight > 0) return;
  await waitForEvent(video, "loadedmetadata");
};

const buildConstraintFallbacks = (preferredConstraints) => {
  const preferredVideo = preferredConstraints?.video;

  return [
    preferredConstraints,
    {
      audio: false,
      video:
        typeof preferredVideo === "object" && preferredVideo
          ? { ...preferredVideo, width: undefined, height: undefined }
          : { facingMode: { ideal: "environment" } },
    },
    {
      audio: false,
      video: { facingMode: "environment" },
    },
    {
      audio: false,
      video: true,
    },
  ].filter(Boolean);
};

const openMediaStream = async (preferredConstraints) => {
  const attempts = buildConstraintFallbacks(preferredConstraints);
  let lastError = null;

  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Unable to open camera stream");
};

const attachStreamToVideo = async (video, stream) => {
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("muted", "true");
  video.setAttribute("autoplay", "true");
  video.srcObject = stream;

  await waitForVideoReady(video);

  try {
    await video.play();
  } catch (error) {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForEvent(video, "canplay");
    }

    try {
      await video.play();
    } catch {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        throw error;
      }
    }
  }
};

const drawOverlay = (canvas, corners, confidence, sourceWidth, sourceHeight) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) return;

  const sx = width / sourceWidth;
  const sy = height / sourceHeight;
  ctx.clearRect(0, 0, width, height);

  const stroke = confidence > 0.45 ? "#22c55e" : "#f59e0b";
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(corners[0].x * sx, corners[0].y * sy);
  ctx.lineTo(corners[1].x * sx, corners[1].y * sy);
  ctx.lineTo(corners[2].x * sx, corners[2].y * sy);
  ctx.lineTo(corners[3].x * sx, corners[3].y * sy);
  ctx.closePath();
  ctx.stroke();
};

export class ScannerDoc {
  constructor(options) {
    if (typeof document === "undefined") {
      throw new Error("ScannerDoc requires browser DOM APIs");
    }

    this.video = options.video;
    this.previewCanvas = options.previewCanvas;
    this.detector = new DocumentDetector();
    this.detectIntervalMs = options.detectIntervalMs ?? DEFAULT_INTERVAL_MS;
    this.detectionWidth = options.detectionWidth ?? DEFAULT_DETECTION_WIDTH;
    this.smoothing = clamp(options.smoothing ?? DEFAULT_SMOOTHING, 0, 0.95);
    this.constraints = options.constraints;
    this.onDetect = options.onDetect;
    this.stream = null;
    this.timer = null;
    this.corners = null;
    this.confidence = 0;

    this.processingCanvas = document.createElement("canvas");
    this.frameCanvas = document.createElement("canvas");
    this.outputCanvas = document.createElement("canvas");

    this.processingCtx = this.processingCanvas.getContext("2d", { willReadFrequently: true });
    this.frameCtx = this.frameCanvas.getContext("2d", { willReadFrequently: true });
    this.outputCtx = this.outputCanvas.getContext("2d", { willReadFrequently: true });

    if (!this.processingCtx || !this.frameCtx || !this.outputCtx) {
      throw new Error("2D canvas context is not available");
    }
  }

  async start() {
    if (!this.stream) {
      const constraints = this.constraints ?? {
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };

      this.stream = await openMediaStream(constraints);
      await attachStreamToVideo(this.video, this.stream);
    }

    await waitForVideoReady(this.video);

    if (!this.timer) {
      this.timer = window.setInterval(() => {
        void this.detectOnce();
      }, this.detectIntervalMs);
    }
  }

  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  getCorners() {
    return this.corners;
  }

  setCorners(corners) {
    const width = this.video.videoWidth || 1;
    const height = this.video.videoHeight || 1;
    this.corners = normalizeQuad(corners, width, height);
  }

  async detectOnce() {
    const width = this.video.videoWidth;
    const height = this.video.videoHeight;
    if (width <= 0 || height <= 0) {
      return { corners: defaultQuad(1, 1), confidence: 0, processingMs: 0 };
    }

    const scale = this.detectionWidth / width;
    const targetW = Math.max(120, Math.round(width * Math.min(scale, 1)));
    const targetH = Math.max(90, Math.round(height * Math.min(scale, 1)));

    if (this.processingCanvas.width !== targetW || this.processingCanvas.height !== targetH) {
      this.processingCanvas.width = targetW;
      this.processingCanvas.height = targetH;
    }

    this.processingCtx.drawImage(this.video, 0, 0, targetW, targetH);
    const frame = this.processingCtx.getImageData(0, 0, targetW, targetH);
    const detected = this.detector.detect(frame);

    const scaleX = width / targetW;
    const scaleY = height / targetH;
    const scaled = [
      { x: detected.corners[0].x * scaleX, y: detected.corners[0].y * scaleY },
      { x: detected.corners[1].x * scaleX, y: detected.corners[1].y * scaleY },
      { x: detected.corners[2].x * scaleX, y: detected.corners[2].y * scaleY },
      { x: detected.corners[3].x * scaleX, y: detected.corners[3].y * scaleY },
    ];

    const normalized = normalizeQuad(scaled, width, height);
    this.corners = this.corners
      ? smoothQuad(this.corners, normalized, this.smoothing)
      : normalized;
    this.confidence = detected.confidence;

    if (this.previewCanvas) {
      drawOverlay(this.previewCanvas, this.corners, this.confidence, width, height);
    }

    const result = {
      corners: this.corners,
      confidence: this.confidence,
      processingMs: detected.processingMs,
    };
    if (typeof this.onDetect === "function") {
      this.onDetect(result);
    }
    return result;
  }

  async capture(options = {}) {
    const filter = options.filter ?? "color";
    const mimeType = options.mimeType ?? "image/jpeg";
    const quality = clamp(options.quality ?? 0.92, 0.1, 1);
    const width = this.video.videoWidth;
    const height = this.video.videoHeight;

    if (width <= 0 || height <= 0) {
      throw new Error("Video stream is not ready for capture");
    }

    if (this.frameCanvas.width !== width || this.frameCanvas.height !== height) {
      this.frameCanvas.width = width;
      this.frameCanvas.height = height;
    }

    this.frameCtx.drawImage(this.video, 0, 0, width, height);
    const frame = this.frameCtx.getImageData(0, 0, width, height);
    const corners = this.corners ?? defaultQuad(width, height);

    let warped = warpQuad(frame, corners);
    if (options.maxWidth || options.maxHeight) {
      const sx = options.maxWidth ? options.maxWidth / warped.width : Number.POSITIVE_INFINITY;
      const sy = options.maxHeight ? options.maxHeight / warped.height : Number.POSITIVE_INFINITY;
      const scale = Math.min(sx, sy, 1);
      if (scale < 1) {
        const targetW = Math.max(64, Math.round(warped.width * scale));
        const targetH = Math.max(64, Math.round(warped.height * scale));
        warped = warpQuad(frame, corners, targetW, targetH);
      }
    }

    applyFilter(warped, filter);
    if (this.outputCanvas.width !== warped.width || this.outputCanvas.height !== warped.height) {
      this.outputCanvas.width = warped.width;
      this.outputCanvas.height = warped.height;
    }

    this.outputCtx.putImageData(warped, 0, 0);
    const blob = await toBlob(this.outputCanvas, mimeType, quality);
    const dataUrl = this.outputCanvas.toDataURL(mimeType, quality);

    return {
      blob,
      dataUrl,
      width: warped.width,
      height: warped.height,
      corners,
      confidence: this.confidence,
    };
  }
}

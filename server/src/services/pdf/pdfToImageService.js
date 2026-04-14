import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const DEFAULT_TARGET_WIDTH_PX = 1800;
const DEFAULT_MAX_RENDER_PIXELS = 4_000_000; // ~ 2000x2000

const clampPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const getPdfRenderConfig = () => ({
  targetWidthPx: clampPositiveInt(
    process.env.OCR_PDF_TARGET_WIDTH_PX,
    DEFAULT_TARGET_WIDTH_PX,
  ),
  maxRenderPixels: clampPositiveInt(
    process.env.OCR_PDF_MAX_RENDER_PIXELS,
    DEFAULT_MAX_RENDER_PIXELS,
  ),
});

const resolveScale = (viewport, { targetWidthPx, maxRenderPixels }) => {
  const width = Number(viewport?.width || 0);
  const height = Number(viewport?.height || 0);
  if (width <= 0 || height <= 0) {
    return 1;
  }

  const widthScale = targetWidthPx / width;
  const maxScaleByPixels = Math.sqrt(maxRenderPixels / (width * height));
  const boundedScale = Math.min(widthScale, maxScaleByPixels);

  if (!Number.isFinite(boundedScale) || boundedScale <= 0) {
    return 1;
  }

  return boundedScale;
};

export const convertPdfFirstPageToImageDataUrl = async ({ pdfBuffer }) => {
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new Error("PDF buffer is empty");
  }

  let pdfDocument = null;
  try {
    const loadingTask = getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
      isEvalSupported: false,
    });

    pdfDocument = await loadingTask.promise;

    if (!pdfDocument.numPages || pdfDocument.numPages < 1) {
      throw new Error("PDF has no pages");
    }

    const firstPage = await pdfDocument.getPage(1);
    const baseViewport = firstPage.getViewport({ scale: 1 });
    const renderConfig = getPdfRenderConfig();
    const scale = resolveScale(baseViewport, renderConfig);
    const viewport = firstPage.getViewport({ scale });

    const canvas = createCanvas(
      Math.max(1, Math.ceil(viewport.width)),
      Math.max(1, Math.ceil(viewport.height)),
    );
    const context = canvas.getContext("2d");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await firstPage.render({
      canvasContext: context,
      viewport,
    }).promise;

    firstPage.cleanup();
    await pdfDocument.cleanup();
    await pdfDocument.destroy();
    pdfDocument = null;

    const pngBuffer = canvas.toBuffer("image/png");
    return `data:image/png;base64,${pngBuffer.toString("base64")}`;
  } catch (error) {
    const message = String(error?.message || "unknown pdf rendering error");
    throw new Error(`PDF OCR preprocessing failed: ${message}`);
  } finally {
    if (pdfDocument) {
      try {
        await pdfDocument.cleanup();
      } catch {
        // noop
      }
      try {
        await pdfDocument.destroy();
      } catch {
        // noop
      }
    }
  }
};

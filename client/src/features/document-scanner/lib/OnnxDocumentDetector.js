import { loadOrtRuntime } from "./loadOrtRuntime";

const toTensorData = (imageData, inputSize) => {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = imageData.width;
  sourceCanvas.height = imageData.height;

  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error("Canvas context is not available for ONNX preprocessing");
  }

  sourceContext.putImageData(imageData, 0, 0);

  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = inputSize;
  targetCanvas.height = inputSize;

  const targetContext = targetCanvas.getContext("2d", { willReadFrequently: true });
  if (!targetContext) {
    throw new Error("Canvas context is not available for ONNX preprocessing");
  }

  targetContext.drawImage(sourceCanvas, 0, 0, inputSize, inputSize);
  const resized = targetContext.getImageData(0, 0, inputSize, inputSize);
  const { data } = resized;
  const tensorData = new Float32Array(3 * inputSize * inputSize);
  const planeSize = inputSize * inputSize;

  for (let i = 0, pixelIndex = 0; i < data.length; i += 4, pixelIndex += 1) {
    tensorData[pixelIndex] = data[i] / 255;
    tensorData[planeSize + pixelIndex] = data[i + 1] / 255;
    tensorData[planeSize * 2 + pixelIndex] = data[i + 2] / 255;
  }

  return tensorData;
};

const normalizeCorners = (rawCorners, width, height) => {
  if (!Array.isArray(rawCorners) || rawCorners.length < 8) {
    throw new Error("ONNX detector output must provide 8 corner values");
  }

  const corners = [];
  for (let index = 0; index < 8; index += 2) {
    const normalizedX = Number(rawCorners[index]);
    const normalizedY = Number(rawCorners[index + 1]);

    corners.push({
      x: Math.max(0, Math.min(width - 1, normalizedX * width)),
      y: Math.max(0, Math.min(height - 1, normalizedY * height)),
    });
  }

  return corners;
};

const readTensorValues = (value) => {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (value.data) {
    return Array.from(value.data);
  }

  return null;
};

const resolveOutput = (outputs, preferredKey, fallbackIndex = 0) => {
  if (preferredKey && outputs[preferredKey]) {
    return outputs[preferredKey];
  }

  const values = Object.values(outputs);
  return values[fallbackIndex] ?? null;
};

const sessionCache = new Map();

const loadSession = async ({
  modelUrl,
  provider,
  wasmPaths,
}) => {
  const cacheKey = `${provider}::${wasmPaths}::${modelUrl}`;
  if (!sessionCache.has(cacheKey)) {
    sessionCache.set(
      cacheKey,
      (async () => {
        const runtime = await loadOrtRuntime({ provider, wasmPaths });
        const session = await runtime.ort.InferenceSession.create(modelUrl, {
          executionProviders: [runtime.executionProvider],
          graphOptimizationLevel: "all",
        });

        return {
          runtime,
          session,
        };
      })(),
    );
  }

  return sessionCache.get(cacheKey);
};

export class OnnxDocumentDetector {
  constructor(options) {
    this.modelUrl = options.modelUrl;
    this.provider = options.provider;
    this.wasmPaths = options.wasmPaths;
    this.inputSize = options.inputSize;
    this.meta = {
      kind: "onnx",
      provider: "loading",
      modelUrl: this.modelUrl,
    };
  }

  async initialize() {
    const loaded = await loadSession({
      modelUrl: this.modelUrl,
      provider: this.provider,
      wasmPaths: this.wasmPaths,
    });

    this.meta = {
      kind: "onnx",
      provider: loaded.runtime.executionProvider,
      modelUrl: this.modelUrl,
    };

    return loaded;
  }

  async detect(imageData) {
    const loaded = await this.initialize();
    const { runtime, session } = loaded;

    const inputName = session.inputNames[0];
    const tensorData = toTensorData(imageData, this.inputSize);
    const tensor = new runtime.ort.Tensor("float32", tensorData, [
      1,
      3,
      this.inputSize,
      this.inputSize,
    ]);

    const outputs = await session.run({ [inputName]: tensor });
    const cornersOutput = resolveOutput(outputs, "corners", 0);
    const confidenceOutput = resolveOutput(outputs, "confidence", 1);
    const corners = normalizeCorners(
      readTensorValues(cornersOutput),
      imageData.width,
      imageData.height,
    );
    const confidenceValues = readTensorValues(confidenceOutput);

    return {
      corners,
      confidence:
        confidenceValues && confidenceValues.length > 0
          ? Math.max(0, Math.min(1, Number(confidenceValues[0]) || 0))
          : 0.9,
      processingMs: 0,
    };
  }
}

import { OnnxDocumentDetector } from "./OnnxDocumentDetector";
import { scannerRuntimeConfig } from "../model/scannerRuntimeConfig";

export const createScannerDetector = async ({ mode }) => {
  if (
    scannerRuntimeConfig.detector !== "onnx" ||
    !scannerRuntimeConfig.onnxModelUrl
  ) {
    return {
      detector: null,
      meta: {
        kind: "heuristic",
        provider: "builtin",
      },
    };
  }

  try {
    const detector = new OnnxDocumentDetector({
      mode,
      modelUrl: scannerRuntimeConfig.onnxModelUrl,
      provider: scannerRuntimeConfig.onnxExecutionProvider,
      wasmPaths: scannerRuntimeConfig.onnxWasmPaths,
      inputSize: scannerRuntimeConfig.onnxInputSize,
    });
    await detector.initialize();

    return {
      detector,
      meta: detector.meta,
    };
  } catch (error) {
    console.error("Failed to initialize ONNX document detector:", error);
    return {
      detector: null,
      meta: {
        kind: "heuristic",
        provider: "fallback",
      },
    };
  }
};

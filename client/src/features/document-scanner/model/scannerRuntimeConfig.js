const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const scannerRuntimeConfig = {
  detector: String(import.meta.env.VITE_SCANNER_DETECTOR || "heuristic").toLowerCase(),
  onnxModelUrl: String(import.meta.env.VITE_SCANNER_ONNX_MODEL_URL || "").trim(),
  onnxExecutionProvider: String(
    import.meta.env.VITE_SCANNER_ONNX_PROVIDER || "auto",
  ).toLowerCase(),
  onnxWasmPaths: String(import.meta.env.VITE_SCANNER_ONNX_WASM_PATHS || "").trim(),
  onnxInputSize: parsePositiveNumber(
    import.meta.env.VITE_SCANNER_ONNX_INPUT_SIZE,
    512,
  ),
};

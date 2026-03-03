let ortRuntimePromise = null;

const applyOrtEnv = (ort, wasmPaths) => {
  ort.env.logLevel = "error";

  if (wasmPaths) {
    ort.env.wasm.wasmPaths = wasmPaths;
  }

  if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) {
    ort.env.wasm.numThreads = Math.max(
      1,
      Math.min(4, navigator.hardwareConcurrency),
    );
  }
};

export const loadOrtRuntime = async ({ provider = "auto", wasmPaths = "" } = {}) => {
  if (!ortRuntimePromise) {
    ortRuntimePromise = (async () => {
      const supportsWebGpu =
        provider !== "wasm" &&
        typeof navigator !== "undefined" &&
        "gpu" in navigator;

      if (provider === "webgpu" || supportsWebGpu) {
        try {
          const runtime = await import("onnxruntime-web/webgpu");
          applyOrtEnv(runtime, wasmPaths);
          return {
            ort: runtime,
            executionProvider: supportsWebGpu ? "webgpu" : provider,
          };
        } catch (error) {
          if (provider === "webgpu") {
            throw error;
          }
        }
      }

      const runtime = await import("onnxruntime-web");
      applyOrtEnv(runtime, wasmPaths);
      return {
        ort: runtime,
        executionProvider: "wasm",
      };
    })();
  }

  return ortRuntimePromise;
};

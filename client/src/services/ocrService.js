import api from "./api";

export const ocrService = {
  recognizeDocument: async ({
    documentType,
    fileId,
    employeeId,
    file,
    model,
    prompt,
  }) => {
    const normalizedDocumentType = String(documentType || "").trim();
    const normalizedEmployeeId = String(employeeId || "").trim();
    const normalizedModel = String(model || "").trim();
    const normalizedPrompt = String(prompt || "").trim();

    if (!normalizedDocumentType) {
      throw new Error("documentType is required");
    }

    if (file) {
      const formData = new FormData();
      formData.append("documentType", normalizedDocumentType);
      if (normalizedEmployeeId) {
        formData.append("employeeId", normalizedEmployeeId);
      }
      if (normalizedModel) {
        formData.append("model", normalizedModel);
      }
      if (normalizedPrompt) {
        formData.append("prompt", normalizedPrompt);
      }
      formData.append("file", file);

      const response = await api.post("/ocr/recognize", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      return response.data;
    }

    const payload = {
      documentType: normalizedDocumentType,
      ...(fileId ? { fileId } : {}),
      ...(normalizedEmployeeId ? { employeeId: normalizedEmployeeId } : {}),
      ...(normalizedModel ? { model: normalizedModel } : {}),
      ...(normalizedPrompt ? { prompt: normalizedPrompt } : {}),
    };

    const response = await api.post("/ocr/recognize", payload);
    return response.data;
  },

  confirmFileOcr: async ({ fileId, provider, result }) => {
    const response = await api.post("/ocr/confirm", {
      fileId,
      provider,
      result,
    });
    return response.data;
  },
};

export default ocrService;

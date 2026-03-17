import { useRef, useState } from "react";
import { Input, Modal, message } from "antd";
import otService from "@/services/otService";

const useOtContractorDocumentActions = ({
  selectedConstructionSiteId,
  counterpartyId,
  isStaffMode,
  loadContractorDocs,
}) => {
  const [uploadingDocId, setUploadingDocId] = useState(null);
  const uploadInputRef = useRef(null);
  const uploadTargetRef = useRef(null);

  const reloadContractorDocs = async () => {
    await loadContractorDocs({
      constructionSiteId: selectedConstructionSiteId,
      counterpartyId,
      isStaffMode,
    });
  };

  const handleDownloadTemplate = async (doc) => {
    try {
      const response = await otService.downloadDocumentTemplate(doc.id);
      const url = response.data?.data?.url;
      if (url) {
        window.open(url, "_blank");
      }
    } catch (error) {
      console.error("Error downloading OT template:", error);
      message.error("Ошибка при скачивании шаблона");
    }
  };

  const handleDownloadContractorFile = async (doc, fileId = null) => {
    if (!doc?.contractorDocumentId) return;

    try {
      const response = await otService.downloadContractorDocFile(
        doc.contractorDocumentId,
        fileId,
      );
      const url = response.data?.data?.url;
      if (url) {
        window.open(url, "_blank");
      }
    } catch (error) {
      console.error("Error downloading OT contractor file:", error);
      message.error("Ошибка при скачивании файла");
    }
  };

  const handlePreviewContractorFile = async (doc, fileId) => {
    if (!doc?.contractorDocumentId || !fileId) return null;

    try {
      const response = await otService.getContractorDocFileView(
        doc.contractorDocumentId,
        fileId,
      );
      return response.data?.data || null;
    } catch (error) {
      console.error("Error loading OT contractor file preview:", error);
      message.error("Ошибка при загрузке предпросмотра");
      return null;
    }
  };

  const handleUploadClick = (doc) => {
    if (doc?.type === "category") {
      let nextDocumentName = "";

      Modal.confirm({
        title: "Новый документ",
        content: (
          <Input
            autoFocus
            placeholder="Название документа"
            onChange={(event) => {
              nextDocumentName = event.target.value;
            }}
            onPressEnter={(event) => {
              event.preventDefault();
            }}
          />
        ),
        okText: "Продолжить",
        cancelText: "Отмена",
        onOk: () => {
          const normalizedDocumentName = nextDocumentName.trim();
          if (!normalizedDocumentName) {
            message.error("Укажите название документа");
            return Promise.reject(new Error("documentName is required"));
          }

          uploadTargetRef.current = {
            type: "category",
            id: doc.id,
            documentName: normalizedDocumentName,
          };

          if (uploadInputRef.current) {
            uploadInputRef.current.value = "";
            uploadInputRef.current.click();
          }

          return true;
        },
      });
      return;
    }

    uploadTargetRef.current = doc;
    if (uploadInputRef.current) {
      uploadInputRef.current.value = "";
      uploadInputRef.current.click();
    }
  };

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const doc = uploadTargetRef.current;
    if (!doc) return;

    try {
      setUploadingDocId(doc.id);
      const payload =
        doc?.type === "category"
          ? {
              categoryId: doc.id,
              documentName: doc.documentName,
              constructionSiteId: selectedConstructionSiteId,
            }
          : {
              documentId: doc.id,
              constructionSiteId: selectedConstructionSiteId,
            };
      if (isStaffMode) {
        if (!counterpartyId) {
          message.error("Выберите подрядчика для загрузки");
          return;
        }
        payload.counterpartyId = counterpartyId;
      }

      let uploadedCount = 0;
      let failedCount = 0;

      for (const file of files) {
        try {
          await otService.uploadContractorDoc(file, payload);
          uploadedCount += 1;
        } catch (uploadError) {
          console.error("Error uploading OT contractor file:", uploadError);
          failedCount += 1;
        }
      }

      if (uploadedCount > 0) {
        const successMessage =
          uploadedCount === 1
            ? "Документ загружен"
            : `Загружено файлов: ${uploadedCount}`;
        message.success(successMessage);
      }

      if (failedCount > 0) {
        const failMessage =
          failedCount === 1
            ? "Не удалось загрузить 1 файл"
            : `Не удалось загрузить файлов: ${failedCount}`;
        message.error(failMessage);
      }

      await reloadContractorDocs();
    } catch (error) {
      console.error("Error uploading OT contractor files:", error);
      message.error("Ошибка при загрузке документа");
    } finally {
      setUploadingDocId(null);
    }
  };

  const handleDeleteContractorFile = async (doc, fileId) => {
    if (!doc?.contractorDocumentId || !fileId) return;

    Modal.confirm({
      title: "Удалить файл?",
      content: "Файл будет удален без возможности восстановления.",
      okText: "Удалить",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        try {
          await otService.deleteContractorDocFile(doc.contractorDocumentId, fileId);
          message.success("Файл удален");
          await reloadContractorDocs();
        } catch (error) {
          console.error("Error deleting OT contractor file:", error);
          message.error("Ошибка при удалении файла");
        }
      },
    });
  };

  const handleApprove = async (doc) => {
    if (!doc?.contractorDocumentId || !doc?.fileCount) return;

    try {
      await otService.approveContractorDoc(doc.contractorDocumentId);
      message.success("Документ подтвержден");
      await reloadContractorDocs();
    } catch (error) {
      console.error("Error approving OT contractor doc:", error);
      message.error("Ошибка при подтверждении документа");
    }
  };

  const handleReject = (doc) => {
    if (!doc?.contractorDocumentId || !doc?.fileCount) return;

    let rejectComment = "";

    Modal.confirm({
      title: "Отклонить документ?",
      content: (
        <Input.TextArea
          rows={3}
          placeholder="Укажите причину отклонения"
          onChange={(event) => {
            rejectComment = event.target.value;
          }}
        />
      ),
      okText: "Отклонить",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        const comment = rejectComment.trim();
        if (!comment) {
          message.error("Укажите причину");
          return Promise.reject(new Error("Комментарий обязателен"));
        }

        try {
          await otService.rejectContractorDoc(doc.contractorDocumentId, comment);
          message.success("Документ отклонен");
          await reloadContractorDocs();
          return true;
        } catch (error) {
          console.error("Error rejecting OT contractor doc:", error);
          message.error("Ошибка при отклонении документа");
          return Promise.reject(error);
        }
      },
    });
  };

  return {
    uploadingDocId,
    uploadInputRef,
    handleDownloadTemplate,
    handleDownloadContractorFile,
    handlePreviewContractorFile,
    handleUploadClick,
    handleFileChange,
    handleDeleteContractorFile,
    handleApprove,
    handleReject,
  };
};

export default useOtContractorDocumentActions;

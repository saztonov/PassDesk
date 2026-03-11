import { useState } from "react";
import { Form, Modal, message } from "antd";
import otService from "@/services/otService";

const useOtSettingsDocumentActions = ({ loadSettingsData }) => {
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [documentTemplateFileList, setDocumentTemplateFileList] = useState([]);
  const [documentForm] = Form.useForm();

  const handleOpenDocumentModal = (doc = null, defaultCategoryId = null) => {
    setEditingDocument(doc);
    documentForm.resetFields();
    setDocumentTemplateFileList([]);
    if (doc) {
      documentForm.setFieldsValue({
        name: doc.name,
        description: doc.description,
        isRequired: doc.isRequired,
        categoryId: doc.categoryId,
      });
    } else {
      documentForm.setFieldsValue({
        isRequired: false,
        categoryId: defaultCategoryId || undefined,
      });
    }
    setDocumentModalOpen(true);
  };

  const handleDocumentSubmit = async () => {
    try {
      const values = await documentForm.validateFields();
      const templateFile = documentTemplateFileList[0]?.originFileObj;
      if (editingDocument) {
        await otService.updateDocument(editingDocument.id, values);
        if (templateFile) {
          await otService.uploadDocumentTemplate(editingDocument.id, templateFile);
        }
        message.success("Документ обновлен");
      } else {
        const response = await otService.createDocument(values);
        const createdId = response.data?.data?.id;
        if (createdId && templateFile) {
          await otService.uploadDocumentTemplate(createdId, templateFile);
        }
        message.success("Документ создан");
      }
      setDocumentModalOpen(false);
      setEditingDocument(null);
      setDocumentTemplateFileList([]);
      await loadSettingsData();
    } catch (error) {
      if (error?.errorFields) return;
      console.error("Error saving OT document:", error);
      message.error("Ошибка при сохранении документа");
    }
  };

  const handleDeleteDocument = (doc) => {
    Modal.confirm({
      title: "Удалить документ?",
      content: "Документ будет скрыт в списке.",
      okText: "Удалить",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        try {
          await otService.deleteDocument(doc.id);
          message.success("Документ удален");
          await loadSettingsData();
        } catch (error) {
          console.error("Error deleting OT document:", error);
          message.error("Ошибка при удалении документа");
        }
      },
    });
  };

  return {
    documentModalOpen,
    editingDocument,
    setDocumentModalOpen,
    documentForm,
    documentTemplateFileList,
    setDocumentTemplateFileList,
    handleOpenDocumentModal,
    handleDocumentSubmit,
    handleDeleteDocument,
  };
};

export default useOtSettingsDocumentActions;

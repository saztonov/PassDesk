import { UploadOutlined } from "@ant-design/icons";
import { Button, Form, Input, Modal, Select, Switch, Upload } from "antd";

const DocumentModal = ({
  documentModalOpen,
  editingDocument,
  onCloseDocumentModal,
  onSubmitDocument,
  documentForm,
  categoryOptions,
  selectFullStyle,
  selectDropdownStyle,
  documentTemplateFileList,
  onDocumentTemplateFileListChange,
}) => (
  <Modal
    open={documentModalOpen}
    title={editingDocument ? "Редактировать документ" : "Новый документ"}
    onCancel={onCloseDocumentModal}
    onOk={onSubmitDocument}
    okText={editingDocument ? "Сохранить" : "Создать"}
    cancelText="Отмена"
  >
    <Form form={documentForm} layout="vertical">
      <Form.Item
        name="name"
        label="Название"
        rules={[{ required: true, message: "Укажите название" }]}
      >
        <Input placeholder="Название документа" />
      </Form.Item>
      <Form.Item name="description" label="Описание">
        <Input.TextArea rows={3} placeholder="Описание" />
      </Form.Item>
      <Form.Item
        name="categoryId"
        label="Категория"
        rules={[{ required: true, message: "Выберите категорию" }]}
      >
        <Select
          options={categoryOptions}
          style={selectFullStyle}
          popupMatchSelectWidth={false}
          styles={{ popup: { root: selectDropdownStyle } }}
        />
      </Form.Item>
      <Form.Item name="isRequired" label="Обязательный" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item label="Шаблон документа (опционально)">
        <Upload
          fileList={documentTemplateFileList}
          beforeUpload={() => false}
          onChange={({ fileList }) => onDocumentTemplateFileListChange(fileList)}
          maxCount={1}
        >
          <Button icon={<UploadOutlined />}>Выбрать файл</Button>
        </Upload>
      </Form.Item>
    </Form>
  </Modal>
);

export default DocumentModal;

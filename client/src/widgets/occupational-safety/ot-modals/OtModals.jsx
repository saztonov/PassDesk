import CategoryDocumentsModal from "@/widgets/occupational-safety/ot-modals/ui/CategoryDocumentsModal";
import CategoryModal from "@/widgets/occupational-safety/ot-modals/ui/CategoryModal";
import DocumentCommentsModal from "@/widgets/occupational-safety/ot-modals/ui/DocumentCommentsModal";
import DocumentModal from "@/widgets/occupational-safety/ot-modals/ui/DocumentModal";
import InstructionModal from "@/widgets/occupational-safety/ot-modals/ui/InstructionModal";
import TemplateModal from "@/widgets/occupational-safety/ot-modals/ui/TemplateModal";

const OtModals = ({
  categoryModalOpen,
  editingCategory,
  onCloseCategoryModal,
  onSubmitCategory,
  categoryForm,
  categoryOptions,
  selectFullStyle,
  selectDropdownStyle,
  documentModalOpen,
  editingDocument,
  onCloseDocumentModal,
  onSubmitDocument,
  documentForm,
  documentTemplateFileList,
  onDocumentTemplateFileListChange,
  categoryDocumentsModalOpen,
  categoryDocumentsTarget,
  categoryDocumentsList,
  onCloseCategoryDocumentsModal,
  onOpenDocumentModal,
  onDeleteDocument,
  templateModalOpen,
  onCloseTemplateModal,
  onSubmitTemplate,
  templateForm,
  templateFileList,
  onTemplateFileListChange,
  instructionModalOpen,
  onCloseInstructionModal,
  onSubmitInstruction,
  editingInstruction,
  instructionForm,
  instructionFileList,
  onInstructionFileListChange,
  documentCommentModalOpen,
  documentCommentTarget,
  onCloseDocumentCommentModal,
  documentCommentsLoading,
  documentComments,
  documentCommentText,
  onDocumentCommentTextChange,
  onAddDocumentComment,
  onDeleteDocumentComment,
  canDeleteDocumentComments,
}) => (
  <>
    <CategoryModal
      categoryModalOpen={categoryModalOpen}
      editingCategory={editingCategory}
      onCloseCategoryModal={onCloseCategoryModal}
      onSubmitCategory={onSubmitCategory}
      categoryForm={categoryForm}
      categoryOptions={categoryOptions}
      selectFullStyle={selectFullStyle}
      selectDropdownStyle={selectDropdownStyle}
    />
    <DocumentModal
      documentModalOpen={documentModalOpen}
      editingDocument={editingDocument}
      onCloseDocumentModal={onCloseDocumentModal}
      onSubmitDocument={onSubmitDocument}
      documentForm={documentForm}
      categoryOptions={categoryOptions}
      selectFullStyle={selectFullStyle}
      selectDropdownStyle={selectDropdownStyle}
      documentTemplateFileList={documentTemplateFileList}
      onDocumentTemplateFileListChange={onDocumentTemplateFileListChange}
    />
    <CategoryDocumentsModal
      categoryDocumentsModalOpen={categoryDocumentsModalOpen}
      categoryDocumentsTarget={categoryDocumentsTarget}
      categoryDocumentsList={categoryDocumentsList}
      onCloseCategoryDocumentsModal={onCloseCategoryDocumentsModal}
      onOpenDocumentModal={onOpenDocumentModal}
      onDeleteDocument={onDeleteDocument}
    />
    <TemplateModal
      templateModalOpen={templateModalOpen}
      onCloseTemplateModal={onCloseTemplateModal}
      onSubmitTemplate={onSubmitTemplate}
      templateForm={templateForm}
      templateFileList={templateFileList}
      onTemplateFileListChange={onTemplateFileListChange}
    />
    <InstructionModal
      instructionModalOpen={instructionModalOpen}
      onCloseInstructionModal={onCloseInstructionModal}
      onSubmitInstruction={onSubmitInstruction}
      editingInstruction={editingInstruction}
      instructionForm={instructionForm}
      instructionFileList={instructionFileList}
      onInstructionFileListChange={onInstructionFileListChange}
    />
    <DocumentCommentsModal
      documentCommentModalOpen={documentCommentModalOpen}
      documentCommentTarget={documentCommentTarget}
      onCloseDocumentCommentModal={onCloseDocumentCommentModal}
      documentCommentsLoading={documentCommentsLoading}
      documentComments={documentComments}
      documentCommentText={documentCommentText}
      onDocumentCommentTextChange={onDocumentCommentTextChange}
      onAddDocumentComment={onAddDocumentComment}
      onDeleteDocumentComment={onDeleteDocumentComment}
      canDeleteDocumentComments={canDeleteDocumentComments}
    />
  </>
);

export default OtModals;

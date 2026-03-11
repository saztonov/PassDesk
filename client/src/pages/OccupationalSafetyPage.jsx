import { Tabs, Typography, Space, Result } from "antd";
import AllSitesTab from "@/pages/occupationalSafety/AllSitesTab";
import ObjectTab from "@/pages/occupationalSafety/ObjectTab";
import ContractorTab from "@/widgets/occupational-safety/contractor-tab/ContractorTab";
import SettingsTab from "@/widgets/occupational-safety/settings-tab/SettingsTab";
import OtModals from "@/pages/occupationalSafety/OtModals";
import useOccupationalSafety from "@/pages/occupationalSafety/useOccupationalSafety.js";

const { Title } = Typography;

const buildTabs = (ot) => {
  const items = [];

  if (ot.isStaff) {
    items.push(
      {
        key: "all",
        label: ot.t("ot.tabs.all"),
        children: (
          <AllSitesTab
            allSiteSummaries={ot.allSiteSummaries}
            allSiteLoading={ot.allSiteLoading}
            onOpenObject={ot.handleOpenObject}
          />
        ),
      },
      {
        key: "object",
        label: ot.t("ot.tabs.object"),
        children: (
          <ObjectTab
            constructionSiteOptions={ot.constructionSiteOptions}
            selectedConstructionSiteId={ot.selectedConstructionSiteId}
            onSelectConstructionSite={ot.setSelectedConstructionSiteId}
            selectCollapsedStyle={ot.selectCollapsedStyle}
            selectDropdownStyle={ot.selectDropdownStyle}
            objectStatusSummary={ot.objectStatusSummary}
            objectStatusLoading={ot.objectStatusLoading}
            objectStatuses={ot.objectStatuses}
            contractorStatusMeta={ot.contractorStatusMeta}
            isStaff={ot.isStaff}
            onTempAdmit={ot.handleTempAdmit}
            onManualAdmit={ot.handleManualAdmit}
            onBlockContractor={ot.handleBlockContractor}
            onOpenContractor={ot.handleOpenContractor}
          />
        ),
      },
    );
  }

  items.push({
    key: "contractor",
    label: ot.t("ot.tabs.contractor"),
    children: (
      <ContractorTab
        isStaff={ot.isStaff}
        uploadInputRef={ot.uploadInputRef}
        onFileChange={ot.handleFileChange}
        constructionSiteOptions={ot.constructionSiteOptions}
        selectedConstructionSiteId={ot.selectedConstructionSiteId}
        onSelectConstructionSite={ot.setSelectedConstructionSiteId}
        selectCollapsedStyle={ot.selectCollapsedStyle}
        contractorSelectStyle={ot.contractorSelectStyle}
        selectDropdownStyle={ot.selectDropdownStyle}
        counterpartyOptions={ot.counterpartyOptions}
        selectedCounterpartyId={ot.selectedCounterpartyId}
        onSelectCounterparty={ot.setSelectedCounterpartyId}
        hasContractorSelection={ot.hasContractorSelection}
        contractorLoading={ot.contractorLoading}
        normalizedStats={ot.normalizedStats}
        contractorCommentsLoading={ot.contractorCommentsLoading}
        contractorComments={ot.contractorComments}
        contractorCommentText={ot.contractorCommentText}
        onContractorCommentTextChange={(event) =>
          ot.setContractorCommentText(event.target.value)
        }
        contractorCommentEnabled={ot.contractorCommentEnabled}
        onAddContractorComment={ot.handleAddContractorComment}
        contractorCommentEditOpen={ot.contractorCommentEditOpen}
        contractorCommentForm={ot.contractorCommentForm}
        onCloseContractorCommentEdit={ot.handleCloseContractorCommentEdit}
        onUpdateContractorComment={ot.handleUpdateContractorComment}
        onOpenEditContractorComment={ot.handleOpenEditContractorComment}
        onDeleteContractorComment={ot.handleDeleteContractorComment}
        contractorTree={ot.contractorTree}
        statusMeta={ot.statusMeta}
        uploadingDocId={ot.uploadingDocId}
        onDownloadTemplate={ot.handleDownloadTemplate}
        onDownloadContractorFile={ot.handleDownloadContractorFile}
        onPreviewContractorFile={ot.handlePreviewContractorFile}
        onDeleteContractorFile={ot.handleDeleteContractorFile}
        onOpenDocumentComments={ot.handleOpenDocumentComments}
        onUploadClick={ot.handleUploadClick}
        onApprove={ot.handleApprove}
        onReject={ot.handleReject}
        isContractorUser={ot.isContractorUser}
        latestInstruction={ot.latestInstruction}
        settingsInstructions={ot.settingsInstructions}
        onDownloadInstructionFile={ot.handleDownloadInstructionFile}
        onTempAdmit={ot.handleTempAdmit}
        onManualAdmit={ot.handleManualAdmit}
        onBlockContractor={ot.handleBlockContractor}
      />
    ),
  });

  if (ot.canManageSettings) {
    items.push({
      key: "settings",
      label: ot.t("ot.tabs.settings"),
      children: (
        <SettingsTab
          templateInputRef={ot.templateInputRef}
          onTemplateFileChange={ot.handleTemplateFileChange}
          settingsLoading={ot.settingsLoading}
          settingsCategoryTree={ot.settingsCategoryTree}
          onSelectCategoryNode={ot.handleSelectSettingsCategoryNode}
          onOpenCategoryModal={ot.handleOpenCategoryModal}
          onOpenDocumentModal={ot.handleOpenDocumentModal}
          latestInstruction={ot.latestInstruction}
          settingsInstructions={ot.settingsInstructions}
          onOpenInstructionModal={ot.handleOpenInstructionModal}
          onDownloadInstructionFile={ot.handleDownloadInstructionFile}
          onEditInstruction={ot.handleOpenInstructionModal}
          onDeleteInstruction={ot.handleDeleteInstruction}
        />
      ),
    });
  }

  return items;
};

const OccupationalSafetyPage = () => {
  const ot = useOccupationalSafety();

  if (!ot.isAllowed) {
    return (
      <Result
        status="403"
        title={ot.t("common.accessDenied")}
        subTitle={ot.t("ot.accessDenied")}
      />
    );
  }

  const tabs = buildTabs(ot);

  return (
    <div style={{ padding: 16 }}>
      <Space
        direction="vertical"
        size={ot.isStaff ? 12 : 4}
        style={{ width: "100%" }}
      >
        <Title level={3} style={{ margin: 0 }}>
          {ot.t("ot.title")}
        </Title>
        {ot.isStaff ? (
          <Tabs
            className="ot-sticky-tabs"
            items={tabs}
            activeKey={ot.activeTab}
            onChange={ot.setActiveTab}
          />
        ) : (
          tabs[0]?.children
        )}
      </Space>
      <OtModals
        categoryModalOpen={ot.categoryModalOpen}
        editingCategory={ot.editingCategory}
        onCloseCategoryModal={() => ot.setCategoryModalOpen(false)}
        onSubmitCategory={ot.handleCategorySubmit}
        categoryForm={ot.categoryForm}
        categoryOptions={ot.categoryOptions}
        selectFullStyle={ot.selectFullStyle}
        selectDropdownStyle={ot.selectDropdownStyle}
        documentModalOpen={ot.documentModalOpen}
        editingDocument={ot.editingDocument}
        onCloseDocumentModal={() => ot.setDocumentModalOpen(false)}
        onSubmitDocument={ot.handleDocumentSubmit}
        documentForm={ot.documentForm}
        documentTemplateFileList={ot.documentTemplateFileList}
        onDocumentTemplateFileListChange={
          ot.handleDocumentTemplateFileListChange
        }
        categoryDocumentsModalOpen={ot.categoryDocumentsModalOpen}
        categoryDocumentsTarget={ot.categoryDocumentsTarget}
        categoryDocumentsList={ot.categoryDocumentsList}
        onCloseCategoryDocumentsModal={ot.handleCloseCategoryDocumentsModal}
        onOpenDocumentModal={ot.handleOpenDocumentModal}
        onDeleteDocument={ot.handleDeleteDocument}
        templateModalOpen={ot.templateModalOpen}
        onCloseTemplateModal={() => ot.setTemplateModalOpen(false)}
        onSubmitTemplate={ot.handleTemplateSubmit}
        templateForm={ot.templateForm}
        templateFileList={ot.templateFileList}
        onTemplateFileListChange={ot.handleTemplateFileListChange}
        instructionModalOpen={ot.instructionModalOpen}
        onCloseInstructionModal={ot.handleCloseInstructionModal}
        onSubmitInstruction={ot.handleInstructionSubmit}
        editingInstruction={ot.editingInstruction}
        instructionForm={ot.instructionForm}
        instructionFileList={ot.instructionFileList}
        onInstructionFileListChange={ot.handleInstructionFileListChange}
        documentCommentModalOpen={ot.documentCommentModalOpen}
        documentCommentTarget={ot.documentCommentTarget}
        onCloseDocumentCommentModal={ot.handleCloseDocumentCommentModal}
        documentCommentsLoading={ot.documentCommentsLoading}
        documentComments={ot.documentComments}
        documentCommentText={ot.documentCommentText}
        onDocumentCommentTextChange={(event) =>
          ot.setDocumentCommentText(event.target.value)
        }
        onAddDocumentComment={ot.handleAddDocumentComment}
        onDeleteDocumentComment={ot.handleDeleteDocumentComment}
        canDeleteDocumentComments={ot.isStaff}
      />
    </div>
  );
};

export default OccupationalSafetyPage;

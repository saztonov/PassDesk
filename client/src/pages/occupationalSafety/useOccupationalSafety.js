import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { message, Form, Grid, Modal } from "antd";
import { useAuthStore } from "@/store/authStore";
import settingsService from "@/services/settingsService";
import otService from "@/services/otService";
import { constructionSiteService } from "@/services/constructionSiteService";
import { counterpartyService } from "@/services/counterpartyService";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useTranslation } from "react-i18next";
import buildCategoryOptions from "@/entities/ot/category/model/buildCategoryOptions";
import buildContractorTree from "@/entities/ot/contractor/model/buildContractorTree";
import useOtAccessModel from "@/features/ot/access/model/useOtAccessModel";
import useOtCounterpartySelectionGuard from "@/features/ot/access/model/useOtCounterpartySelectionGuard";
import useOtContractorDocumentActions from "@/features/ot/contractor-document-actions/model/useOtContractorDocumentActions";
import useOtContractorComments from "@/features/ot/contractor-comments/model/useOtContractorComments";
import useOtDocumentComments from "@/features/ot/document-comments/model/useOtDocumentComments";
import useOtSettingsCategoryActions from "@/features/ot/settings-category/model/useOtSettingsCategoryActions";
import useOtSettingsDocumentActions from "@/features/ot/settings-document/model/useOtSettingsDocumentActions";
import useOtSettingsTree from "@/features/ot/settings-tree/model/useOtSettingsTree";

const { useBreakpoint } = Grid;

const useOccupationalSafety = () => {
  const { user } = useAuthStore();
  const [defaultCounterpartyId, setDefaultCounterpartyId] = useState(null);
  const [selectionOptions, setSelectionOptions] = useState({
    constructionSites: [],
    counterparties: [],
  });
  const { constructionSites, counterparties } = selectionOptions;
  const [selectedConstructionSiteId, setSelectedConstructionSiteId] =
    useState(null);
  const [selectedCounterpartyId, setSelectedCounterpartyId] = useState(null);
  const [contractorCategories, setContractorCategories] = useState([]);
  const [contractorStats, setContractorStats] = useState({
    total: 0,
    uploaded: 0,
    approved: 0,
    rejected: 0,
    missing: 0,
  });
  const [contractorLoading, setContractorLoading] = useState(false);
  const templateInputRef = useRef(null);
  const templateUploadTargetRef = useRef(null);
  const [activeTab, setActiveTab] = useState("contractor");
  const [settingsCategories, setSettingsCategories] = useState([]);
  const [settingsDocuments, setSettingsDocuments] = useState([]);
  const [settingsInstructions, setSettingsInstructions] = useState([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [instructionModalOpen, setInstructionModalOpen] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState(null);
  const [templateUploadingId, setTemplateUploadingId] = useState(null);
  const [templateFileList, setTemplateFileList] = useState([]);
  const [instructionFileList, setInstructionFileList] = useState([]);
  const [objectStatuses, setObjectStatuses] = useState([]);
  const [objectStatusLoading, setObjectStatusLoading] = useState(false);
  const [allSiteSummaries, setAllSiteSummaries] = useState([]);
  const [allSiteLoading, setAllSiteLoading] = useState(false);
  const allSiteRequestRef = useRef(0);
  const [templateForm] = Form.useForm();
  const [instructionForm] = Form.useForm();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { t } = useTranslation();
  const selectMinWidth = 300;
  const selectMaxWidth = 500;
  const selectCollapsedStyle = { width: selectMinWidth };
  const contractorSelectStyle = { width: 250 };
  const selectFullStyle = { width: "100%", minWidth: selectMinWidth };
  const selectDropdownStyle = {
    minWidth: selectMinWidth,
    maxWidth: selectMaxWidth,
  };

  usePageTitle(t("ot.title"), isMobile);

  useEffect(() => {
    const loadDefaultCounterpartyId = async () => {
      try {
        const response = await settingsService.getPublicSettings();
        if (response.success && response.data.defaultCounterpartyId) {
          setDefaultCounterpartyId(response.data.defaultCounterpartyId);
        }
      } catch (error) {
        console.error("Error loading default counterparty ID:", error);
      }
    };

    loadDefaultCounterpartyId();
  }, []);

  const {
    isStaff,
    canManageSettings,
    isDefaultCounterpartyUser,
    isContractorUser,
    isAllowed,
    counterpartyId,
    constructionSiteId,
    hasContractorSelection,
    contractorCommentEnabled,
  } = useOtAccessModel({
    user,
    defaultCounterpartyId,
    activeTab,
    setActiveTab,
    selectedConstructionSiteId,
    selectedCounterpartyId,
  });

  const loadContractorDocs = async ({
    constructionSiteId,
    counterpartyId,
    isStaffMode,
  }) => {
    if (!constructionSiteId || !counterpartyId) return;

    try {
      setContractorLoading(true);
      const params = { constructionSiteId };
      if (isStaffMode) {
        params.counterpartyId = counterpartyId;
      }

      const response = await otService.getContractorDocs(params);
      const payload = response.data?.data || {};
      const stats = payload.stats || {};

      setContractorCategories(payload.categories || []);
      setContractorStats({
        total: stats.total || 0,
        uploaded: stats.uploaded || 0,
        approved: stats.approved || 0,
        rejected: stats.rejected || 0,
        missing: stats.not_uploaded || 0,
      });
    } catch (error) {
      console.error("Error loading OT contractor docs:", error);
      message.error("Ошибка при загрузке документов подрядчика");
    } finally {
      setContractorLoading(false);
    }
  };

  useEffect(() => {
    if (!isAllowed) return;

    const loadInitialData = async () => {
      try {
        if (isStaff) {
          const [sitesResponse, counterpartiesResponse] = await Promise.all([
            constructionSiteService.getAll({ limit: 1000 }),
            counterpartyService.getAll({
              limit: 1000,
              include: "construction_sites",
            }),
          ]);

          const sites =
            sitesResponse.data?.data?.constructionSites ||
            sitesResponse.data?.data ||
            [];
          const counterpartyList =
            counterpartiesResponse.data?.data?.counterparties ||
            counterpartiesResponse.data?.data ||
            [];

          setSelectionOptions({
            constructionSites: sites,
            counterparties: counterpartyList,
          });
        } else if (isContractorUser && user?.counterpartyId) {
          const response = await counterpartyService.getConstructionSites(
            user.counterpartyId,
          );
          const sites = response.data?.data || [];
          setSelectionOptions((prev) => ({
            ...prev,
            constructionSites: sites,
          }));
        }
      } catch (error) {
        console.error("Error loading OT initial data:", error);
        message.error("Ошибка при загрузке данных ОТ");
      }
    };

    loadInitialData();
  }, [
    isAllowed,
    isStaff,
    isContractorUser,
    user?.counterpartyId,
    selectedConstructionSiteId,
    selectedCounterpartyId,
  ]);

  const {
    contractorComments,
    contractorCommentsLoading,
    contractorCommentText,
    setContractorCommentText,
    contractorCommentEditOpen,
    editingContractorComment,
    contractorCommentForm,
    loadContractorComments,
    handleAddContractorComment,
    handleOpenEditContractorComment,
    handleUpdateContractorComment,
    handleDeleteContractorComment,
    handleCloseContractorCommentEdit,
  } = useOtContractorComments({
    constructionSiteId,
    counterpartyId,
  });

  const {
    documentComments,
    documentCommentsLoading,
    documentCommentText,
    setDocumentCommentText,
    documentCommentModalOpen,
    documentCommentTarget,
    handleOpenDocumentComments,
    handleAddDocumentComment,
    handleDeleteDocumentComment,
    handleCloseDocumentCommentModal,
  } = useOtDocumentComments();

  const isStaffMode = isStaff;

  const {
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
  } = useOtContractorDocumentActions({
    selectedConstructionSiteId,
    counterpartyId,
    isStaffMode,
    loadContractorDocs,
  });

  useEffect(() => {
    if (!constructionSiteId || !counterpartyId) return;

    loadContractorDocs({
      constructionSiteId,
      counterpartyId,
      isStaffMode,
    });
    loadContractorComments();
  }, [constructionSiteId, counterpartyId, isStaffMode, loadContractorComments]);

  const loadSettingsData = async () => {
    try {
      setSettingsLoading(true);
      const [categoriesRes, documentsRes, instructionsRes] = await Promise.all([
        otService.getCategories(),
        otService.getDocuments(),
        otService.getInstructions(),
      ]);

      const categories = categoriesRes.data?.data || [];
      const documents = documentsRes.data?.data || [];
      const instructions = instructionsRes.data?.data || [];

      setSettingsCategories(categories);
      setSettingsDocuments(documents);
      setSettingsInstructions(instructions);
    } catch (error) {
      console.error("Error loading OT settings:", error);
      message.error("Ошибка при загрузке настроек");
    } finally {
      setSettingsLoading(false);
    }
  };

  const {
    categoryModalOpen,
    editingCategory,
    setCategoryModalOpen,
    categoryForm,
    handleOpenCategoryModal,
    handleCategorySubmit,
    handleDeleteCategory,
  } = useOtSettingsCategoryActions({ loadSettingsData });

  const {
    documentModalOpen,
    editingDocument,
    setDocumentModalOpen,
    documentForm,
    documentTemplateFileList,
    setDocumentTemplateFileList,
    handleOpenDocumentModal,
    handleDocumentSubmit,
    handleDeleteDocument,
  } = useOtSettingsDocumentActions({ loadSettingsData });

  const handleDocumentTemplateFileListChange = useCallback(
    (fileList) => setDocumentTemplateFileList(fileList.slice(-1)),
    [setDocumentTemplateFileList],
  );

  const loadInstructionsOnly = async () => {
    try {
      const instructionsRes = await otService.getInstructions();
      setSettingsInstructions(instructionsRes.data?.data || []);
    } catch (error) {
      console.error("Error loading OT instructions:", error);
      message.error("Ошибка при загрузке инструкций");
    }
  };

  useEffect(() => {
    if (!isAllowed) return;
    if (canManageSettings) {
      loadSettingsData();
      return;
    }
    loadInstructionsOnly();
  }, [isAllowed, canManageSettings]);

  const loadObjectStatuses = async (constructionSiteIdValue) => {
    if (!constructionSiteIdValue) return;

    try {
      setObjectStatusLoading(true);
      const response = await otService.getContractorStatuses({
        constructionSiteId: constructionSiteIdValue,
      });
      setObjectStatuses(response.data?.data || []);
    } catch (error) {
      console.error("Error loading OT contractor statuses:", error);
      message.error("Ошибка при загрузке статусов подрядчиков");
    } finally {
      setObjectStatusLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedConstructionSiteId) return;
    if (!isStaff) return;
    loadObjectStatuses(selectedConstructionSiteId);
  }, [selectedConstructionSiteId, isStaff]);

  const loadAllSiteSummaries = async () => {
    if (!isStaff) return;

    const requestId = allSiteRequestRef.current + 1;
    allSiteRequestRef.current = requestId;

    const initialSummaries = (constructionSites || []).map((site) => ({
      site,
      counts: null,
      loading: true,
      error: false,
    }));

    setAllSiteSummaries(initialSummaries);
    setAllSiteLoading(true);

    try {
      const siteIds = (constructionSites || []).map((site) => site.id);
      if (!siteIds.length) {
        setAllSiteSummaries([]);
        return;
      }

      const response = await otService.getContractorStatusSummary({
        constructionSiteIds: siteIds.join(","),
      });
      const summaries = response.data?.data || [];

      if (allSiteRequestRef.current !== requestId) return;

      const summaryMap = new Map(
        summaries.map((summary) => [summary.constructionSiteId, summary]),
      );

      setAllSiteSummaries(
        (constructionSites || []).map((site) => {
          const summary = summaryMap.get(site.id);
          if (!summary) {
            return { site, counts: null, loading: false, error: true };
          }

          const counts = {
            admitted: summary.counts?.admitted ?? summary.admittedCount ?? 0,
            not_admitted:
              summary.counts?.not_admitted ?? summary.notAdmittedCount ?? 0,
            temp_admitted:
              summary.counts?.temp_admitted ?? summary.tempAdmittedCount ?? 0,
            blocked: summary.counts?.blocked ?? summary.blockedCount ?? 0,
          };

          return { site, counts, loading: false, error: false };
        }),
      );
    } catch (error) {
      console.error("Error loading OT site summaries:", error);
      setAllSiteSummaries(
        (constructionSites || []).map((site) => ({
          site,
          counts: null,
          loading: false,
          error: true,
        })),
      );
    } finally {
      if (allSiteRequestRef.current === requestId) {
        setAllSiteLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!isStaff) return;
    if (!constructionSites.length) return;
    loadAllSiteSummaries();
  }, [isStaff, constructionSites]);

  const contractorTree = useMemo(() => {
    if (!contractorCategories.length) return [];
    return buildContractorTree(contractorCategories);
  }, [contractorCategories]);

  const statusMeta = {
    not_uploaded: { text: "Не загружен", color: "default" },
    uploaded: { text: "Загружен", color: "blue" },
    approved: { text: "Подтвержден", color: "green" },
    rejected: { text: "Отклонен", color: "red" },
  };

  const contractorStatusMeta = {
    admitted: { text: "Допущен", color: "green" },
    not_admitted: { text: "Не допущен", color: "red" },
    temp_admitted: { text: "Временный допуск", color: "gold" },
    blocked: { text: "Заблокирован", color: "volcano" },
  };

  const handleDownloadInstructionFile = async (instruction) => {
    try {
      const response = await otService.downloadInstructionFile(instruction.id);
      const url = response.data?.data?.url;
      if (url) {
        window.open(url, "_blank");
      }
    } catch (error) {
      console.error("Error downloading OT instruction:", error);
      message.error("Ошибка при скачивании инструкции");
    }
  };

  const handleTemplateUploadClick = (doc) => {
    templateUploadTargetRef.current = doc;
    if (templateInputRef.current) {
      templateInputRef.current.value = "";
      templateInputRef.current.click();
    }
  };

  const handleTemplateFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const doc = templateUploadTargetRef.current;
    if (!doc) return;

    try {
      setTemplateUploadingId(doc.id);
      await otService.uploadDocumentTemplate(doc.id, file);
      message.success("Шаблон загружен");
      await loadSettingsData();
    } catch (error) {
      console.error("Error uploading OT template file:", error);
      message.error("Ошибка при загрузке шаблона");
    } finally {
      setTemplateUploadingId(null);
    }
  };

  const handleTemplateSubmit = async () => {
    try {
      const values = await templateForm.validateFields();
      const file = templateFileList[0]?.originFileObj;
      if (!file) {
        message.error("Выберите файл");
        return;
      }
      await otService.createTemplate(file, values);
      message.success("Шаблон добавлен");
      setTemplateModalOpen(false);
      setTemplateFileList([]);
      await loadSettingsData();
    } catch (error) {
      if (error?.errorFields) return;
      console.error("Error creating OT template:", error);
      message.error("Ошибка при добавлении шаблона");
    }
  };

  const handleOpenInstructionModal = (instruction = null) => {
    setEditingInstruction(instruction);
    instructionForm.resetFields();
    setInstructionFileList([]);
    if (instruction) {
      instructionForm.setFieldsValue({
        text: instruction.text || "",
        removeFile: false,
      });
    }
    setInstructionModalOpen(true);
  };

  const handleInstructionSubmit = async () => {
    try {
      const values = await instructionForm.validateFields();
      const file = instructionFileList[0]?.originFileObj;
      if (editingInstruction) {
        await otService.updateInstruction(editingInstruction.id, file, {
          text: values.text,
          removeFile: !!values.removeFile,
        });
        message.success("Инструкция обновлена");
      } else {
        await otService.createInstruction(file, values);
        message.success("Инструкция добавлена");
      }
      handleCloseInstructionModal();
      await loadSettingsData();
    } catch (error) {
      if (error?.errorFields) return;
      console.error("Error creating OT instruction:", error);
      message.error("Ошибка при сохранении инструкции");
    }
  };

  const handleTemplateFileListChange = useCallback(
    (fileList) => setTemplateFileList(fileList.slice(-1)),
    [],
  );

  const handleInstructionFileListChange = useCallback(
    (fileList) => {
      setInstructionFileList(fileList.slice(-1));
      if (fileList.length > 0) {
        instructionForm.setFieldValue("removeFile", false);
      }
    },
    [instructionForm],
  );

  const handleCloseInstructionModal = useCallback(() => {
    setInstructionModalOpen(false);
    setEditingInstruction(null);
    setInstructionFileList([]);
    instructionForm.resetFields();
  }, [instructionForm]);

  const handleDeleteInstruction = (instruction) => {
    Modal.confirm({
      title: "Удалить инструкцию?",
      content: "Запись будет удалена вместе с прикрепленным файлом.",
      okText: "Удалить",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        try {
          await otService.deleteInstruction(instruction.id);
          message.success("Инструкция удалена");

          if (editingInstruction?.id === instruction.id) {
            handleCloseInstructionModal();
          }

          await loadSettingsData();
        } catch (error) {
          console.error("Error deleting OT instruction:", error);
          message.error("Ошибка при удалении инструкции");
        }
      },
    });
  };

  const handleOpenObject = (siteId) => {
    setSelectedConstructionSiteId(siteId);
    setActiveTab("object");
  };

  const handleOpenContractor = (counterpartyIdValue) => {
    setSelectedCounterpartyId(counterpartyIdValue);
    setActiveTab("contractor");
  };

  const handleManualStatus = async (
    counterpartyIdValue,
    status,
    successMessage,
    errorMessage,
  ) => {
    if (!counterpartyIdValue || !selectedConstructionSiteId) return;

    try {
      await otService.overrideContractorStatus(
        counterpartyIdValue,
        selectedConstructionSiteId,
        status,
      );
      message.success(successMessage);
      await loadObjectStatuses(selectedConstructionSiteId);
    } catch (error) {
      console.error("Error overriding OT contractor status:", error);
      message.error(errorMessage);
    }
  };

  const handleTempAdmit = (counterpartyIdValue) =>
    handleManualStatus(
      counterpartyIdValue,
      "temp_admitted",
      "Временный допуск установлен",
      "Ошибка при временном допуске подрядчика",
    );

  const handleManualAdmit = (counterpartyIdValue) =>
    handleManualStatus(
      counterpartyIdValue,
      "admitted",
      "Допуск установлен вручную",
      "Ошибка при ручном допуске подрядчика",
    );

  const handleBlockContractor = (counterpartyIdValue) =>
    handleManualStatus(
      counterpartyIdValue,
      "blocked",
      "Подрядчик заблокирован",
      "Ошибка при блокировке подрядчика",
    );

  const normalizedStats = useMemo(
    () => ({
      total: contractorStats.total || 0,
      uploaded: contractorStats.uploaded || 0,
      approved: contractorStats.approved || 0,
      rejected: contractorStats.rejected || 0,
      missing: contractorStats.missing || 0,
    }),
    [contractorStats],
  );

  const constructionSiteOptions = useMemo(
    () =>
      constructionSites.map((site) => ({
        label: site.shortName || site.fullName || site.id,
        value: site.id,
      })),
    [constructionSites],
  );

  const counterpartyOptions = useMemo(() => {
    let filtered = defaultCounterpartyId
      ? counterparties.filter(
          (counterparty) => counterparty.id !== defaultCounterpartyId,
        )
      : counterparties;

    if (isStaff) {
      if (!selectedConstructionSiteId) {
        filtered = [];
      } else {
        filtered = filtered.filter((counterparty) =>
          (counterparty.constructionSites || []).some(
            (site) => site.id === selectedConstructionSiteId,
          ),
        );
      }
    }

    return filtered.map((counterparty) => ({
      label: counterparty.name || counterparty.id,
      value: counterparty.id,
    }));
  }, [
    counterparties,
    defaultCounterpartyId,
    isStaff,
    selectedConstructionSiteId,
  ]);

  useOtCounterpartySelectionGuard({
    isStaff,
    selectedConstructionSiteId,
    selectedCounterpartyId,
    counterpartyOptions,
    setSelectedCounterpartyId,
  });

  const categoryOptions = useMemo(
    () => buildCategoryOptions(settingsCategories || []),
    [settingsCategories],
  );

  const {
    settingsCategoryTree,
    categoryDocumentsModalOpen,
    categoryDocumentsTarget,
    categoryDocumentsList,
    handleCloseCategoryDocumentsModal,
    handleSelectSettingsCategoryNode,
  } = useOtSettingsTree({
    settingsCategories,
    settingsDocuments,
    handleDeleteCategory,
    handleOpenCategoryModal,
    handleOpenDocumentModal,
  });

  const objectStatusSummary = useMemo(() => {
    return objectStatuses.reduce(
      (acc, item) => {
        acc[item.status] += 1;
        return acc;
      },
      { admitted: 0, not_admitted: 0, temp_admitted: 0, blocked: 0 },
    );
  }, [objectStatuses]);

  const latestInstruction = useMemo(() => {
    if (!settingsInstructions.length) return null;
    return [...settingsInstructions].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    )[0];
  }, [settingsInstructions]);

  return {
    t,
    isAllowed,
    isDefaultCounterpartyUser,
    activeTab,
    setActiveTab,
    isStaff,
    canManageSettings,
    isContractorUser,
    allSiteSummaries,
    allSiteLoading,
    handleOpenObject,
    constructionSiteOptions,
    selectedConstructionSiteId,
    setSelectedConstructionSiteId,
    selectCollapsedStyle,
    contractorSelectStyle,
    selectDropdownStyle,
    objectStatusSummary,
    objectStatusLoading,
    objectStatuses,
    contractorStatusMeta,
    handleTempAdmit,
    handleManualAdmit,
    handleBlockContractor,
    handleOpenContractor,
    uploadInputRef,
    templateInputRef,
    handleFileChange,
    handleTemplateFileChange,
    counterpartyOptions,
    selectedCounterpartyId,
    setSelectedCounterpartyId,
    hasContractorSelection,
    contractorLoading,
    normalizedStats,
    contractorCommentsLoading,
    contractorComments,
    contractorCommentText,
    setContractorCommentText,
    contractorCommentEnabled,
    handleAddContractorComment,
    contractorCommentEditOpen,
    editingContractorComment,
    contractorCommentForm,
    handleOpenEditContractorComment,
    handleUpdateContractorComment,
    handleDeleteContractorComment,
    handleCloseContractorCommentEdit,
    contractorTree,
    statusMeta,
    uploadingDocId,
    handleDownloadContractorFile,
    handlePreviewContractorFile,
    handleDeleteContractorFile,
    handleOpenDocumentComments,
    handleUploadClick,
    handleApprove,
    handleReject,
    settingsLoading,
    settingsCategoryTree,
    handleSelectSettingsCategoryNode,
    handleOpenCategoryModal,
    handleCloseCategoryDocumentsModal,
    categoryDocumentsModalOpen,
    categoryDocumentsTarget,
    categoryDocumentsList,
    categoryOptions,
    handleDownloadTemplate,
    templateUploadingId,
    handleTemplateUploadClick,
    handleOpenDocumentModal,
    handleDeleteDocument,
    latestInstruction,
    settingsInstructions,
    handleOpenInstructionModal,
    handleDownloadInstructionFile,
    handleDeleteInstruction,
    categoryModalOpen,
    editingCategory,
    setCategoryModalOpen,
    handleCategorySubmit,
    categoryForm,
    selectFullStyle,
    documentModalOpen,
    editingDocument,
    setDocumentModalOpen,
    handleDocumentSubmit,
    documentForm,
    documentTemplateFileList,
    handleDocumentTemplateFileListChange,
    templateModalOpen,
    setTemplateModalOpen,
    handleTemplateSubmit,
    templateForm,
    templateFileList,
    handleTemplateFileListChange,
    instructionModalOpen,
    setInstructionModalOpen,
    handleCloseInstructionModal,
    handleInstructionSubmit,
    editingInstruction,
    instructionForm,
    instructionFileList,
    handleInstructionFileListChange,
    documentCommentModalOpen,
    documentCommentTarget,
    handleCloseDocumentCommentModal,
    documentCommentsLoading,
    documentComments,
    documentCommentText,
    setDocumentCommentText,
    handleAddDocumentComment,
    handleDeleteDocumentComment,
  };
};

export default useOccupationalSafety;

import { useState, useEffect, useCallback } from "react";
import { Form, App } from "antd";
import { constructionSiteService } from "@/services/constructionSiteService";
import { useAuthStore } from "@/store/authStore";
import { useReferencesStore } from "@/store/referencesStore";
import { DEFAULT_FORM_CONFIG } from "@/shared/config/employeeFields";
import {
  formatBankAccountNumber,
  formatBankBik,
  formatBlankNumber,
  formatInn,
  formatKig,
  formatPatentNumber,
  formatPassportDepartmentCode,
  formatPhoneNumber,
  formatRussianPassportNumber,
  formatSnils,
  normalizeBankAccountNumber,
  normalizeBankBik,
  normalizeKig,
  normalizePatentNumber,
  normalizePassportDepartmentCode,
  normalizePhoneNumber,
  normalizeRussianPassportNumber,
} from "./employeeFormUtils";
import {
  buildDraftNormalizedValues,
  buildEmployeeInitialFormData,
  buildSaveNormalizedValues,
  normalizeDigitsOnly,
  stripStatusFlags,
} from "./employeeFormModelUtils";

const TEMP_HIDDEN_FIELDS = new Set([
  "gender",
  "email",
]);

const doesCitizenshipRequirePatent = (citizenship) =>
  citizenship?.requiresPatent !== false && citizenship?.isEaeu !== true;

/**
 * Хук для управления формой сотрудника
 * Содержит общую логику для десктопной и мобильной версий
 * Использует глобальный кэш для справочников
 */
export const useEmployeeForm = (employee, visible, onSuccess) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const watchedCitizenshipId = Form.useWatch("citizenshipId", form);
  const { user } = useAuthStore();

  // Получаем справочники из глобального кэша
  const {
    citizenships: cachedCitizenships,
    positions: cachedPositions,
    settings: cachedSettings,
    formConfigDefault,
    formConfigExternal,
    fetchCitizenships,
    fetchPositions,
    fetchSettings,
  } = useReferencesStore();

  // Локальные состояния
  const [citizenships, setCitizenships] = useState([]);
  const [constructionSites, setConstructionSites] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [selectedCitizenship, setSelectedCitizenship] = useState(null);
  const [defaultCounterpartyId, setDefaultCounterpartyId] = useState(null);
  const [documentProfilesConfig, setDocumentProfilesConfig] = useState(null);
  const [activeConfig, setActiveConfig] = useState(DEFAULT_FORM_CONFIG);

  // Определяем, требуется ли патент для выбранного гражданства
  const requiresPatent = doesCitizenshipRequirePatent(selectedCitizenship);

  // Определяем активный конфиг
  useEffect(() => {
    // Если пользователь из дефолтного контрагента - берем дефолтный конфиг
    // Иначе - внешний конфиг
    const isDefault = user?.counterpartyId === defaultCounterpartyId;
    const config = isDefault
      ? formConfigDefault || DEFAULT_FORM_CONFIG
      : formConfigExternal || DEFAULT_FORM_CONFIG;
    setActiveConfig(config);
  }, [user, defaultCounterpartyId, formConfigDefault, formConfigExternal]);

  // Хелпер для получения настроек поля
  const getFieldProps = (fieldName) => {
    if (TEMP_HIDDEN_FIELDS.has(fieldName)) {
      return {
        hidden: true,
        rules: [],
        required: false,
      };
    }

    const fieldConfig = activeConfig[fieldName] || {
      visible: true,
      required: false,
    };
    // Если поле не найдено в конфиге (новое), считаем его видимым и необязательным (или можно брать из дефолтов)

    return {
      hidden: !fieldConfig.visible,
      rules: fieldConfig.required
        ? [{ required: true, message: "Обязательное поле" }]
        : [],
      required: fieldConfig.required, // Для отображения звездочки
    };
  };

  // Синхронизируем локальные состояния с кэшем
  useEffect(() => {
    if (cachedCitizenships) {
      setCitizenships(cachedCitizenships);
    }
  }, [cachedCitizenships]);

  useEffect(() => {
    if (cachedPositions) {
      setPositions(cachedPositions);
    }
  }, [cachedPositions]);

  useEffect(() => {
    if (cachedSettings) {
      setDefaultCounterpartyId(cachedSettings.defaultCounterpartyId);
      setDocumentProfilesConfig(
        cachedSettings.employeeDocumentProfiles || null,
      );
    }
  }, [cachedSettings]);

  // Загрузка справочников (теперь использует кэш)
  const loadReferences = useCallback(
    async (abortSignal) => {
      // Если сигнал уже отменён до начала - не делаем запрос
      if (abortSignal?.aborted) {
        return;
      }

      setLoadingReferences(true);
      try {
        // Загружаем из кэша (или делаем запрос если кэш пустой/старый)
        const [, , settingsData] = await Promise.all([
          fetchCitizenships(),
          fetchPositions(),
          fetchSettings(),
        ]);

        // Проверяем, не был ли запрос отменен
        if (abortSignal?.aborted) {
          return;
        }

        const dcId = settingsData?.defaultCounterpartyId;
        setDefaultCounterpartyId(dcId);
        setDocumentProfilesConfig(
          settingsData?.employeeDocumentProfiles || null,
        );

        // Загружаем объекты строительства с учетом контрагента
        // (Объекты строительства не кэшируем глобально, т.к. они зависят от counterpartyId)
        let sitesData = [];
        if (user?.counterpartyId) {
          try {
            if (user.counterpartyId === dcId) {
              // Для default контрагента - все объекты
              const sitesRes = await constructionSiteService.getAll();
              sitesData = sitesRes.data?.data?.constructionSites || [];
            } else {
              // Для остальных - только назначенные
              const sitesRes =
                await constructionSiteService.getCounterpartyObjects(
                  user.counterpartyId,
                );
              sitesData = sitesRes.data?.data || [];
            }
          } catch (sitesError) {
            console.error("Error loading construction sites:", sitesError);
            // Не показываем ошибку, просто оставляем пустой массив
            sitesData = [];
          }
        }
        setConstructionSites(sitesData);
      } catch (error) {
        // Игнорируем ошибки отмены запроса
        if (error.name === "AbortError" || error.name === "CanceledError") {
          return;
        }
        console.error("❌ Ошибка загрузки справочников:", error);
        message.error("Ошибка загрузки справочников");
      } finally {
        setLoadingReferences(false);
      }
    },
    [
      fetchCitizenships,
      fetchPositions,
      fetchSettings,
      message,
      user?.counterpartyId,
    ],
  );

  // Проверка гражданства
  const checkCitizenship = useCallback((citizenshipId) => {
    if (!citizenshipId) {
      setSelectedCitizenship(null);
      return;
    }

    // Находим гражданство из уже загруженного списка
    const citizenship = citizenships.find((c) => c.id === citizenshipId);
    setSelectedCitizenship(citizenship || null);
  }, [citizenships]);

  useEffect(() => {
    checkCitizenship(watchedCitizenshipId || null);
  }, [watchedCitizenshipId, checkCitizenship]);

  useEffect(() => {
    if (watchedCitizenshipId && !form.getFieldValue("birthCountryId")) {
      form.setFieldValue("birthCountryId", watchedCitizenshipId);
    }
  }, [form, watchedCitizenshipId]);

  // Нормализация СНИЛС и ИНН - удаляем маску, оставляем только цифры
  const normalizeSnils = normalizeDigitsOnly;
  const normalizeInn = normalizeDigitsOnly;

  // Загрузка справочников при монтировании
  useEffect(() => {
    const abortController = new AbortController();
    loadReferences(abortController.signal);

    // Cleanup: отменяем запросы при размонтировании
    return () => {
      abortController.abort();
    };
  }, [loadReferences]);

  // Инициализация данных сотрудника
  const initializeEmployeeData = (isMobile = false) =>
    buildEmployeeInitialFormData({
      employee,
      isMobile,
      formatInn,
      formatSnils,
      formatPhoneNumber,
      formatBankAccountNumber,
      formatKig,
      formatPatentNumber,
      formatBlankNumber,
      formatRussianPassportNumber,
      formatPassportDepartmentCode,
    });

  // Обработка изменения гражданства
  const handleCitizenshipChange = useCallback((citizenshipId) => {
    checkCitizenship(citizenshipId);
    // Автозаполнение страны рождения если ещё не заполнена
    if (citizenshipId && !form.getFieldValue("birthCountryId")) {
      form.setFieldValue("birthCountryId", citizenshipId);
    }
  }, [checkCitizenship, form]);

  // Сохранение формы
  const handleSave = async ({ draftEmployeeId = null } = {}) => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const normalizedValues = stripStatusFlags(
        buildSaveNormalizedValues({
          values,
          normalizers: {
            normalizePhoneNumber,
            normalizeSnils,
            normalizeInn,
            normalizeBankAccountNumber,
            normalizeBankBik,
            normalizeKig,
            normalizePatentNumber,
            normalizeRussianPassportNumber,
            normalizePassportDepartmentCode,
          },
        }),
      );

      const payload = { ...normalizedValues };
      if (draftEmployeeId) {
        payload.__draftEmployeeId = draftEmployeeId;
      }
      delete payload.counterpartyId;

      await onSuccess(payload);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      if (error.errorFields) {
        message.error("Заполните все обязательные поля");
      }
      // Не показываем дополнительную ошибку, если ошибка с сервера - она уже показана в хуке
    }
  };

  // Сохранение черновика без валидации
  const handleSaveDraft = async ({ draftEmployeeId = null } = {}) => {
    try {
      setLoading(true);
      const values = form.getFieldsValue();

      const normalizedValues = stripStatusFlags(
        buildDraftNormalizedValues({
          values,
          normalizers: {
            normalizePhoneNumber,
            normalizeSnils,
            normalizeInn,
            normalizeBankAccountNumber,
            normalizeBankBik,
            normalizeKig,
            normalizePatentNumber,
            normalizeRussianPassportNumber,
            normalizePassportDepartmentCode,
          },
        }),
      );

      const dataToSend = {
        ...normalizedValues,
        isDraft: true,
      };
      if (draftEmployeeId || employee?.id) {
        dataToSend.__draftEmployeeId = draftEmployeeId || employee.id;
      }

      const payload = { ...dataToSend };
      delete payload.counterpartyId;

      const result = await onSuccess(payload);
      setLoading(false);
      return result;
    } catch (error) {
      setLoading(false);
      // Не показываем ошибку здесь, она уже показана в хуке createEmployee
      return null;
    }
  };

  return {
    form,
    loading,
    loadingReferences,
    citizenships,
    constructionSites,
    positions,
    selectedCitizenship,
    requiresPatent,
    defaultCounterpartyId,
    documentProfilesConfig,
    user,
    handleCitizenshipChange,
    handleSave,
    handleSaveDraft,
    initializeEmployeeData,
    // Функции форматирования
    formatPhoneNumber,
    formatSnils,
    formatKig,
    formatBankAccountNumber,
    formatBankBik,
    formatInn,
    formatPatentNumber,
    formatBlankNumber,
    formatPassportDepartmentCode,
    getFieldProps,
  };
};

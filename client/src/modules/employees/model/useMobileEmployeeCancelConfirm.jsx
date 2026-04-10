import { useCallback } from "react";
import { ExclamationCircleOutlined } from "@ant-design/icons";

export const useMobileEmployeeCancelConfirm = ({
  form,
  modal,
  onCancel,
  lastSavedSnapshotRef,
  shouldPromptDraftOnClose,
  saveDraftBeforeClose,
  discardDraftOnClose,
}) => {
  return useCallback(() => {
    const currentSnapshot = JSON.stringify(form.getFieldsValue(true));
    const isDirty =
      form.isFieldsTouched(true) &&
      currentSnapshot !== lastSavedSnapshotRef.current;
    const shouldPromptDraftClose =
      typeof shouldPromptDraftOnClose === "function"
        ? shouldPromptDraftOnClose()
        : false;

    if (!isDirty && !shouldPromptDraftClose) {
      onCancel();
      return;
    }

    if (!shouldPromptDraftClose) {
      modal.confirm({
        title: "Вы уверены?",
        icon: <ExclamationCircleOutlined />,
        content: "Все несохраненные данные будут потеряны. Вы хотите выйти?",
        okText: "Да, выйти",
        okType: "danger",
        cancelText: "Остаться",
        onOk() {
          onCancel();
        },
      });
      return;
    }

    let closedByCross = false;
    let closedByEscape = false;
    const handleConfirmEscape = (event) => {
      if (event.key === "Escape") {
        closedByEscape = true;
      }
    };
    document.addEventListener("keydown", handleConfirmEscape, true);
    modal.confirm({
      title: "Сохранить введенные значения?",
      icon: <ExclamationCircleOutlined />,
      content:
        "Да — сохранить черновик и продолжить позже. Нет — закрыть форму и удалить временный черновик.",
      okText: "Да",
      cancelText: "Нет",
      closable: true,
      closeIcon: (
        <span
          role="button"
          tabIndex={0}
          onClick={() => {
            closedByCross = true;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              closedByCross = true;
            }
          }}
        >
          ×
        </span>
      ),
      keyboard: true,
      maskClosable: false,
      onOk: async () => {
        try {
          const savedDraft = await saveDraftBeforeClose?.();
          if (!savedDraft?.id && shouldPromptDraftClose) {
            throw new Error("close-aborted");
          }
          onCancel({ skipDraftCleanup: true, preserveDraft: true });
        } finally {
          document.removeEventListener("keydown", handleConfirmEscape, true);
        }
      },
      onCancel: async () => {
        if (closedByCross || closedByEscape) {
          document.removeEventListener("keydown", handleConfirmEscape, true);
          return;
        }
        try {
          await discardDraftOnClose?.();
          onCancel({ skipDraftCleanup: true });
        } finally {
          document.removeEventListener("keydown", handleConfirmEscape, true);
        }
      },
    });
  }, [
    discardDraftOnClose,
    form,
    lastSavedSnapshotRef,
    modal,
    onCancel,
    saveDraftBeforeClose,
    shouldPromptDraftOnClose,
  ]);
};

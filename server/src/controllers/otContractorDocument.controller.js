import {
  OtDocument,
  OtCategory,
  OtContractorDocument,
  OtContractorDocumentHistory,
  Counterparty,
  ConstructionSite,
  File,
} from "../models/index.js";
import { Op } from "sequelize";
import { AppError } from "../middleware/errorHandler.js";
import {
  assertOtAccess,
  assertCounterpartySiteAccess,
} from "../utils/otAccess.js";
import { uploadOtFile } from "../services/otFileService.js";
import { recalculateStatus } from "../services/otStatusService.js";
import storageProvider from "../config/storage.js";
import { buildFileProxyUrl } from "../services/fileDownloadTokenService.js";

const buildLinkedFilePayload = (file) => ({
  id: file.id,
  name: file.fileName || file.originalName,
  uploadedAt: file.createdAt || null,
  uploadedBy: file.uploadedBy || null,
});

const resolveActiveContractorFile = async (
  contractorDocumentId,
  fileId,
  legacyFileId = null,
) => {
  if (!fileId) return null;

  const linkedFile = await File.findOne({
    where: {
      id: fileId,
      entityType: "other",
      entityId: contractorDocumentId,
      isDeleted: false,
    },
  });

  if (linkedFile) {
    return linkedFile;
  }

  if (legacyFileId && fileId === legacyFileId) {
    return File.findOne({
      where: { id: fileId, isDeleted: false },
    });
  }

  return null;
};

const buildStatusTree = (
  categories,
  documents,
  contractorDocs,
  linkedFilesByContractorDocId,
) => {
  const documentMap = new Map();
  contractorDocs.forEach((doc) => documentMap.set(doc.documentId, doc));

  const categoryMap = new Map();
  categories.forEach((category) => {
    categoryMap.set(category.id, {
      id: category.id,
      name: category.name,
      description: category.description,
      parentId: category.parentId,
      sortOrder: category.sortOrder,
      children: [],
      documents: [],
    });
  });

  documents.forEach((doc) => {
    const contractorDoc = documentMap.get(doc.id);
    const status = contractorDoc?.status || "not_uploaded";
    const linkedFiles = contractorDoc
      ? linkedFilesByContractorDocId.get(contractorDoc.id) || []
      : [];

    const fallbackFile =
      linkedFiles.length === 0 &&
      contractorDoc?.file &&
      !contractorDoc.file.isDeleted
        ? [buildLinkedFilePayload(contractorDoc.file)]
        : [];

    const files = linkedFiles.length > 0 ? linkedFiles : fallbackFile;

    const node = categoryMap.get(doc.categoryId);
    if (node) {
      node.documents.push({
        id: doc.id,
        name: doc.name,
        description: doc.description,
        isRequired: doc.isRequired,
        templateFileId: doc.templateFileId,
        status,
        contractorDocumentId: contractorDoc?.id || null,
        fileId: contractorDoc?.fileId || null,
        files,
        fileCount: files.length,
        comment: contractorDoc?.comment || null,
        uploadedBy: contractorDoc?.uploadedBy || null,
        checkedBy: contractorDoc?.checkedBy || null,
        checkedAt: contractorDoc?.checkedAt || null,
        updatedAt: contractorDoc?.updatedAt || null,
      });
    }
  });

  const roots = [];
  categoryMap.forEach((node) => {
    if (node.parentId && categoryMap.has(node.parentId)) {
      categoryMap.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortTree = (nodes) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    nodes.forEach((node) => sortTree(node.children));
  };

  sortTree(roots);
  return roots;
};

const updateDocumentHistory = async (
  contractorDocumentId,
  status,
  comment,
  userId,
) => {
  await OtContractorDocumentHistory.update(
    { isActive: false },
    {
      where: {
        contractorDocumentId,
        isActive: true,
      },
    },
  );

  await OtContractorDocumentHistory.create({
    contractorDocumentId,
    status,
    comment,
    changedBy: userId,
    isActive: true,
  });
};

export const getOtContractorDocuments = async (req, res, next) => {
  try {
    const { isStaff } = await assertOtAccess(req.user);

    const { counterpartyId: counterpartyIdQuery, constructionSiteId } =
      req.query;

    if (!constructionSiteId) {
      throw new AppError("constructionSiteId обязателен", 400);
    }

    const counterpartyId = isStaff
      ? counterpartyIdQuery
      : req.user.counterpartyId;

    if (!counterpartyId) {
      throw new AppError("counterpartyId обязателен", 400);
    }

    await assertCounterpartySiteAccess(
      req.user,
      counterpartyId,
      constructionSiteId,
    );

    const [categories, documents, contractorDocs] = await Promise.all([
      OtCategory.findAll({
        where: { isDeleted: false },
        order: [
          ["sortOrder", "ASC"],
          ["createdAt", "ASC"],
        ],
      }),
      OtDocument.findAll({
        where: { isDeleted: false },
        order: [["createdAt", "ASC"]],
      }),
      OtContractorDocument.findAll({
        where: { counterpartyId, constructionSiteId },
        include: [
          {
            model: File,
            as: "file",
            required: false,
          },
        ],
      }),
    ]);

    const contractorDocumentIds = contractorDocs.map((doc) => doc.id);
    const linkedFiles = contractorDocumentIds.length
      ? await File.findAll({
          where: {
            entityType: "other",
            entityId: contractorDocumentIds,
            isDeleted: false,
          },
          attributes: [
            "id",
            "entityId",
            "originalName",
            "fileName",
            "uploadedBy",
            "createdAt",
          ],
          order: [["createdAt", "DESC"]],
        })
      : [];

    const linkedFilesByContractorDocId = new Map();
    linkedFiles.forEach((file) => {
      const contractorDocumentId = file.entityId;
      const existing = linkedFilesByContractorDocId.get(contractorDocumentId);
      const payload = buildLinkedFilePayload(file);
      if (existing) {
        existing.push(payload);
      } else {
        linkedFilesByContractorDocId.set(contractorDocumentId, [payload]);
      }
    });

    const tree = buildStatusTree(
      categories,
      documents,
      contractorDocs,
      linkedFilesByContractorDocId,
    );

    const stats = {
      total: 0,
      uploaded: 0,
      approved: 0,
      rejected: 0,
      not_uploaded: 0,
    };
    const countDocs = (nodes) => {
      nodes.forEach((node) => {
        node.documents.forEach((doc) => {
          stats.total += 1;
          stats[doc.status] += 1;
        });
        if (node.children.length > 0) {
          countDocs(node.children);
        }
      });
    };
    countDocs(tree);

    res.json({
      success: true,
      data: {
        counterpartyId,
        constructionSiteId,
        stats,
        categories: tree,
      },
    });
  } catch (error) {
    console.error("Error fetching OT contractor docs:", error);
    next(error);
  }
};

export const uploadOtContractorDocument = async (req, res, next) => {
  try {
    const { isStaff } = await assertOtAccess(req.user);

    const {
      documentId,
      categoryId,
      documentName,
      constructionSiteId,
      counterpartyId: counterpartyIdBody,
    } = req.body;

    if (!req.file) {
      throw new AppError("Файл не предоставлен", 400);
    }

    if (!constructionSiteId) {
      throw new AppError("constructionSiteId обязателен", 400);
    }

    const counterpartyId = isStaff
      ? counterpartyIdBody
      : req.user.counterpartyId;

    if (!counterpartyId) {
      throw new AppError("counterpartyId обязателен", 400);
    }

    await assertCounterpartySiteAccess(
      req.user,
      counterpartyId,
      constructionSiteId,
    );

    const normalizedDocumentName = String(documentName || "").trim();

    let document = null;
    if (documentId) {
      document = await OtDocument.findByPk(documentId);
      if (!document || document.isDeleted) {
        throw new AppError("Документ не найден", 404);
      }
    } else {
      if (!isStaff) {
        throw new AppError(
          "Подрядчик не может создавать новые документы из категории",
          403,
        );
      }

      if (!categoryId || !normalizedDocumentName) {
        throw new AppError(
          "Для создания документа нужны categoryId и documentName",
          400,
        );
      }

      const category = await OtCategory.findByPk(categoryId);
      if (!category || category.isDeleted) {
        throw new AppError("Категория не найдена", 404);
      }

      document = await OtDocument.findOne({
        where: {
          categoryId,
          isDeleted: false,
          name: {
            [Op.iLike]: normalizedDocumentName,
          },
        },
      });

      if (!document) {
        document = await OtDocument.create({
          categoryId,
          name: normalizedDocumentName,
          description: null,
          isRequired: false,
        });
      }
    }

    const [counterparty, constructionSite] = await Promise.all([
      Counterparty.findByPk(counterpartyId),
      ConstructionSite.findByPk(constructionSiteId),
    ]);

    const fileRecord = await uploadOtFile({
      file: req.file,
      folderParts: [
        counterparty?.name || counterpartyId,
        constructionSite?.shortName ||
          constructionSite?.fullName ||
          constructionSiteId,
        document.name,
      ],
      uploadedBy: req.user.id,
      entityType: "other",
      entityId: document.id,
    });

    let contractorDocument = await OtContractorDocument.findOne({
      where: { documentId: document.id, counterpartyId, constructionSiteId },
    });

    if (contractorDocument) {
      await contractorDocument.update({
        fileId: fileRecord.id,
        status: "uploaded",
        comment: null,
        uploadedBy: req.user.id,
        checkedBy: null,
        checkedAt: null,
      });
    } else {
      contractorDocument = await OtContractorDocument.create({
        documentId: document.id,
        counterpartyId,
        constructionSiteId,
        fileId: fileRecord.id,
        status: "uploaded",
        uploadedBy: req.user.id,
      });
    }

    await fileRecord.update({
      entityType: "other",
      entityId: contractorDocument.id,
    });

    await updateDocumentHistory(
      contractorDocument.id,
      "uploaded",
      null,
      req.user.id,
    );
    await recalculateStatus(counterpartyId, constructionSiteId, req.user.id);

    res.status(201).json({
      success: true,
      message: "Документ загружен",
      data: contractorDocument,
    });
  } catch (error) {
    console.error("Error uploading OT contractor doc:", error);
    next(error);
  }
};

export const approveOtContractorDocument = async (req, res, next) => {
  try {
    await assertOtAccess(req.user, { requireStaff: true });

    const { id } = req.params;

    const contractorDocument = await OtContractorDocument.findByPk(id);
    if (!contractorDocument) {
      throw new AppError("Документ подрядчика не найден", 404);
    }

    const currentFile = await resolveActiveContractorFile(
      contractorDocument.id,
      contractorDocument.fileId,
      contractorDocument.fileId,
    );
    if (!currentFile) {
      throw new AppError("Нет загруженного файла для подтверждения", 400);
    }

    await contractorDocument.update({
      status: "approved",
      comment: null,
      checkedBy: req.user.id,
      checkedAt: new Date(),
    });

    await updateDocumentHistory(
      contractorDocument.id,
      "approved",
      null,
      req.user.id,
    );

    await recalculateStatus(
      contractorDocument.counterpartyId,
      contractorDocument.constructionSiteId,
      req.user.id,
    );

    res.json({
      success: true,
      message: "Документ подтвержден",
      data: contractorDocument,
    });
  } catch (error) {
    console.error("Error approving OT contractor doc:", error);
    next(error);
  }
};

export const rejectOtContractorDocument = async (req, res, next) => {
  try {
    await assertOtAccess(req.user, { requireStaff: true });

    const { id } = req.params;
    const normalizedComment = String(req.body?.comment || "").trim();

    if (!normalizedComment) {
      throw new AppError("Комментарий обязателен", 400);
    }

    const contractorDocument = await OtContractorDocument.findByPk(id);
    if (!contractorDocument) {
      throw new AppError("Документ подрядчика не найден", 404);
    }

    const currentFile = await resolveActiveContractorFile(
      contractorDocument.id,
      contractorDocument.fileId,
      contractorDocument.fileId,
    );
    if (!currentFile) {
      throw new AppError("Нет загруженного файла для отклонения", 400);
    }

    await contractorDocument.update({
      status: "rejected",
      comment: normalizedComment,
      checkedBy: req.user.id,
      checkedAt: new Date(),
    });

    await updateDocumentHistory(
      contractorDocument.id,
      "rejected",
      normalizedComment,
      req.user.id,
    );

    await recalculateStatus(
      contractorDocument.counterpartyId,
      contractorDocument.constructionSiteId,
      req.user.id,
    );

    res.json({
      success: true,
      message: "Документ отклонен",
      data: contractorDocument,
    });
  } catch (error) {
    console.error("Error rejecting OT contractor doc:", error);
    next(error);
  }
};

export const downloadOtContractorDocumentFile = async (req, res, next) => {
  try {
    const { isStaff } = await assertOtAccess(req.user);

    const { id } = req.params;
    const { fileId } = req.query;

    const contractorDocument = await OtContractorDocument.findByPk(id);
    if (!contractorDocument) {
      throw new AppError("Документ подрядчика не найден", 404);
    }

    if (
      !isStaff &&
      contractorDocument.counterpartyId !== req.user.counterpartyId
    ) {
      throw new AppError("Нет доступа к документу", 403);
    }

    const targetFileId = fileId || contractorDocument.fileId;
    const file = await resolveActiveContractorFile(
      contractorDocument.id,
      targetFileId,
      contractorDocument.fileId,
    );
    if (!file || file.isDeleted) {
      throw new AppError("Файл не найден", 404);
    }

    if (file.isEncrypted) {
      return res.json({
        success: true,
        data: {
          url: buildFileProxyUrl(req, file.id, "attachment"),
          fileName: file.fileName || file.originalName,
        },
      });
    }

    const downloadData = await storageProvider.getDownloadUrl(file.filePath, {
      expiresIn: 3600,
      fileName: file.fileName || file.originalName,
    });

    res.json({
      success: true,
      data: {
        url: downloadData.url,
        fileName: file.fileName || file.originalName,
      },
    });
  } catch (error) {
    console.error("Error downloading OT contractor doc file:", error);
    next(error);
  }
};

export const getOtContractorDocumentFileView = async (req, res, next) => {
  try {
    const { isStaff } = await assertOtAccess(req.user);
    const { id, fileId } = req.params;

    const contractorDocument = await OtContractorDocument.findByPk(id);
    if (!contractorDocument) {
      throw new AppError("Документ подрядчика не найден", 404);
    }

    if (
      !isStaff &&
      contractorDocument.counterpartyId !== req.user.counterpartyId
    ) {
      throw new AppError("Нет доступа к документу", 403);
    }

    const file = await resolveActiveContractorFile(
      contractorDocument.id,
      fileId,
      contractorDocument.fileId,
    );
    if (!file) {
      throw new AppError("Файл не найден", 404);
    }

    if (file.isEncrypted) {
      return res.json({
        success: true,
        data: {
          viewUrl: buildFileProxyUrl(req, file.id, "inline"),
          fileName: file.fileName || file.originalName,
          mimeType: file.mimeType,
        },
      });
    }

    const viewData = await storageProvider.getPublicUrl(file.filePath, {
      expiresIn: 86400,
    });

    res.json({
      success: true,
      data: {
        viewUrl: viewData.url,
        fileName: file.fileName || file.originalName,
        mimeType: file.mimeType,
      },
    });
  } catch (error) {
    console.error("Error getting OT contractor doc file view link:", error);
    next(error);
  }
};

export const deleteOtContractorDocumentFile = async (req, res, next) => {
  try {
    const { isStaff } = await assertOtAccess(req.user);
    const { id, fileId } = req.params;

    const contractorDocument = await OtContractorDocument.findByPk(id);
    if (!contractorDocument) {
      throw new AppError("Документ подрядчика не найден", 404);
    }

    if (
      !isStaff &&
      contractorDocument.counterpartyId !== req.user.counterpartyId
    ) {
      throw new AppError("Нет доступа к документу", 403);
    }

    const file = await resolveActiveContractorFile(
      contractorDocument.id,
      fileId,
      contractorDocument.fileId,
    );
    if (!file) {
      throw new AppError("Файл не найден", 404);
    }

    await file.update({ isDeleted: true });

    try {
      await storageProvider.deleteFile(file.filePath);
    } catch (deleteError) {
      console.warn(
        "Warning deleting OT contractor file from storage:",
        deleteError?.message || deleteError,
      );
    }

    const remainingFiles = await File.findAll({
      where: {
        entityType: "other",
        entityId: contractorDocument.id,
        isDeleted: false,
      },
      attributes: ["id", "uploadedBy"],
      order: [["createdAt", "DESC"]],
    });

    if (remainingFiles.length > 0) {
      const latestFile = remainingFiles[0];
      await contractorDocument.update({
        fileId: latestFile.id,
        status: "uploaded",
        comment: null,
        uploadedBy: latestFile.uploadedBy || contractorDocument.uploadedBy,
        checkedBy: null,
        checkedAt: null,
      });

      await updateDocumentHistory(
        contractorDocument.id,
        "uploaded",
        null,
        req.user.id,
      );
    } else {
      await contractorDocument.update({
        status: "not_uploaded",
        comment: null,
        checkedBy: null,
        checkedAt: null,
      });

      await updateDocumentHistory(
        contractorDocument.id,
        "not_uploaded",
        null,
        req.user.id,
      );
    }

    await recalculateStatus(
      contractorDocument.counterpartyId,
      contractorDocument.constructionSiteId,
      req.user.id,
    );

    res.json({
      success: true,
      message: "Файл удален",
    });
  } catch (error) {
    console.error("Error deleting OT contractor doc file:", error);
    next(error);
  }
};

import express from "express";
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import employeeRoutes from "./employee.routes.js";
import passRoutes from "./pass.routes.js";
import fileRoutes from "./file.routes.js";
import counterpartyRoutes from "./counterparty.routes.js";
import constructionSiteRoutes from "./constructionSite.routes.js";
import contractRoutes from "./contract.routes.js";
import applicationRoutes from "./application.routes.js";
import citizenshipRoutes from "./citizenship.routes.js";
import settingsRoutes from "./settings.routes.js";
import departmentRoutes from "./department.routes.js";
import positionRoutes from "./position.routes.js";
import employeeStatusRoutes from "./employeeStatus.routes.js";
import excelColumnSetRoutes from "./excelColumnSet.routes.js";
import otRoutes from "./ot.routes.js";
import ocrRoutes from "./ocr.routes.js";

const router = express.Router();

// Routes
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/employees", employeeRoutes);
router.use("/", employeeStatusRoutes); // Роуты статусов уже содержат полный путь /employees/:id/statuses
router.use("/passes", passRoutes);
router.use("/files", fileRoutes);
router.use("/counterparties", counterpartyRoutes);
router.use("/construction-sites", constructionSiteRoutes);
router.use("/contracts", contractRoutes);
router.use("/applications", applicationRoutes);
router.use("/citizenships", citizenshipRoutes);
router.use("/settings", settingsRoutes);
router.use("/departments", departmentRoutes);
router.use("/positions", positionRoutes);
router.use("/excel-column-sets", excelColumnSetRoutes);
router.use("/ot", otRoutes);
router.use("/ocr", ocrRoutes);

export default router;

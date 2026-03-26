import express from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { getAuditLogs } from "../controllers/audit.controller.js";

const router = express.Router();

router.use(authenticate);

router.get("/", authorize("admin", "manager"), getAuditLogs);

export default router;

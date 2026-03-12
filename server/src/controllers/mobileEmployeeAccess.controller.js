import {
  getMobileEmployeeSessionState,
  issueMobileEmployeeSkudQrByPhone,
  issueMobileEmployeeSkudQr,
  requestMobileAccessCode,
  revokeMobileEmployeeSession,
  touchMobileEmployeeSession,
  verifyMobileAccessCode,
} from "../services/mobileEmployeeAccessService.js";

export const requestCode = async (req, res, next) => {
  try {
    const data = await requestMobileAccessCode({
      phone: req.body?.phone,
      deviceLabel: req.body?.deviceLabel || "",
      requestIp: req.ip || req.connection?.remoteAddress || null,
    });

    res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyCode = async (req, res, next) => {
  try {
    const data = await verifyMobileAccessCode({
      phone: req.body?.phone,
      code: req.body?.code,
      deviceLabel: req.body?.deviceLabel || "",
      requestIp: req.ip || req.connection?.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    });

    res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const me = async (req, res, next) => {
  try {
    await touchMobileEmployeeSession(req.mobileEmployeeSession);
    const data = await getMobileEmployeeSessionState(req.mobileEmployeeSession);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const issueSkudQr = async (req, res, next) => {
  try {
    const data = await issueMobileEmployeeSkudQr(req.mobileEmployeeSession);
    res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const issueQuickQr = async (req, res, next) => {
  try {
    const data = await issueMobileEmployeeSkudQrByPhone({
      phone: req.body?.phone,
      deviceLabel: req.body?.deviceLabel || "",
      requestIp: req.ip || req.connection?.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    });
    res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const data = await revokeMobileEmployeeSession(req.mobileEmployeeSession);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

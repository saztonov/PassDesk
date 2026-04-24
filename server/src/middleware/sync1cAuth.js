import { timingSafeEqual } from "crypto";
import { AppError } from "./errorHandler.js";

export const authenticateSync1c = (req, _res, next) => {
  const apiKey = process.env.SYNC_1C_API_KEY;
  if (!apiKey) {
    throw new AppError("SYNC_1C_API_KEY не задан на сервере", 500);
  }

  const provided = req.headers["x-1c-key"];
  if (!provided) {
    throw new AppError("Неверный или отсутствующий ключ синхронизации", 401);
  }

  // timingSafeEqual защищает от timing-атак при сравнении секретов
  const a = Buffer.from(provided);
  const b = Buffer.from(apiKey);
  const valid = a.length === b.length && timingSafeEqual(a, b);
  if (!valid) {
    throw new AppError("Неверный или отсутствующий ключ синхронизации", 401);
  }

  next();
};

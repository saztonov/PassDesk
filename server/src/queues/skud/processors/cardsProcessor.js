import { processSkudCardJobById } from "../../../services/skud/SkudCardsService.js";

export const processCardsJob = async (job) => {
  const syncJobId = job?.data?.syncJobId;
  if (!syncJobId) {
    throw new Error("syncJobId is required for skud cards worker");
  }

  return processSkudCardJobById(syncJobId);
};

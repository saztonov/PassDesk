import { processSkudSyncJobById } from "../../../services/skud/SkudSyncService.js";

export const processSyncEmployeeJob = async (job) => {
  const syncJobId = job?.data?.syncJobId;
  if (!syncJobId) {
    throw new Error("syncJobId is required for skud sync worker");
  }

  return processSkudSyncJobById(syncJobId);
};

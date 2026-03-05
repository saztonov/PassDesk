import { processSkudSyncJobById } from "../../../services/skud/SkudSyncService.js";

export const processBlockUnblockJob = async (job) => {
  const syncJobId = job?.data?.syncJobId;
  if (!syncJobId) {
    throw new Error("syncJobId is required for skud block/unblock worker");
  }

  return processSkudSyncJobById(syncJobId);
};

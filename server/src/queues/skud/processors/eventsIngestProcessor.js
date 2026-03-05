import { ingestSkudEvent } from "../../../services/skud/SkudStatsService.js";

export const processEventsIngestJob = async (job) => {
  const payload = job?.data?.payload;
  if (!payload) {
    return null;
  }

  return ingestSkudEvent({ payload, source: "webdel" });
};

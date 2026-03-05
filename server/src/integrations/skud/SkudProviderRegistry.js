import { skudConfig } from "../../services/skud/skudConfig.js";
import { SigurClient } from "./providers/sigur/SigurClient.js";

let instance = null;

export const getSkudProvider = () => {
  if (!instance) {
    if (skudConfig.provider !== "sigur") {
      throw new Error(`Unsupported SKUD provider: ${skudConfig.provider}`);
    }

    instance = new SigurClient({
      baseUrl: skudConfig.sigur.baseUrl,
      username: skudConfig.sigur.username,
      password: skudConfig.sigur.password,
      timeoutMs: skudConfig.sigur.timeoutMs,
    });
  }

  return instance;
};

import axios from "axios";

export class SigurAuth {
  constructor({ baseUrl, username, password, timeoutMs = 15000 }) {
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
    this.username = username;
    this.password = password;
    this.timeoutMs = timeoutMs;
    this.token = null;
    this.refreshToken = null;
    this.expiresAt = null;
  }

  hasValidToken() {
    if (!this.token || !this.expiresAt) return false;
    const expiryTs = new Date(this.expiresAt).getTime();
    if (!Number.isFinite(expiryTs)) return false;
    return expiryTs - Date.now() > 30_000;
  }

  async authenticate(force = false) {
    if (!force && this.hasValidToken()) {
      return this.token;
    }

    const response = await axios.post(
      `${this.baseUrl}/api/v1/users/auth`,
      {
        username: this.username,
        password: this.password,
      },
      {
        timeout: this.timeoutMs,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const payload = response?.data || {};
    if (!payload?.token) {
      throw new Error("Sigur auth response does not contain token");
    }

    this.token = payload.token;
    this.refreshToken = payload.refreshToken || null;
    this.expiresAt = payload.expiresAt || null;

    return this.token;
  }

  async getAuthHeaders(force = false) {
    const token = await this.authenticate(force);
    return {
      Authorization: `Bearer ${token}`,
    };
  }
}

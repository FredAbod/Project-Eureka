/**
 * Mono API Client
 * Handles configuration, authentication headers, and base request logic.
 */
class MonoClient {
  constructor() {
    this.secretKey = process.env.MONO_SECRET_KEY;
    this.publicKey = process.env.MONO_PUBLIC_KEY;
    this.baseUrl = process.env.MONO_BASE_URL || "https://api.withmono.com/v2";

    if (!this.secretKey) console.warn("⚠️ MONO_SECRET_KEY not set");
    if (!this.publicKey) console.warn("⚠️ MONO_PUBLIC_KEY not set");
  }

  /**
   * Get standard headers for v2 API
   */
  getHeaders() {
    return {
      "Content-Type": "application/json",
      accept: "application/json",
      "mono-sec-key": this.secretKey,
    };
  }

  /**
   * Get headers for v3 API
   */
  getV3Headers() {
    return {
      "Content-Type": "application/json",
      accept: "application/json",
      "mono-sec-key": this.secretKey,
    };
  }

  /**
   * Execute a request against the Mono API
   * @param {string} endpoint - API endpoint (e.g., "/accounts/initiate")
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} - JSON response data
   */
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${this.baseUrl}${endpoint}`;
    const headers = options.headers || this.getHeaders();

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || `Mono API Error: ${response.statusText}`,
        );
      }

      return data;
    } catch (error) {
      console.error(`❌ Mono API Request Failed [${endpoint}]:`, error.message);
      throw error;
    }
  }
}

module.exports = new MonoClient();

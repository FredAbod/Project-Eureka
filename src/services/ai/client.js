const Groq = require("groq-sdk");

/**
 * AI Client Service
 * Handles direct communication with Groq API
 * Implements retry logic and error normalization
 */
class AIClient {
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
    this.model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

    if (this.apiKey) {
      this.groq = new Groq({ apiKey: this.apiKey });
      console.log(`🤖 AI Client initialized with model: ${this.model}`);
    } else {
      console.warn("⚠️ GROQ_API_KEY not set. AI features will be disabled.");
    }
  }

  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Send a chat completion request
   * @param {Array} messages - Chat history
   * @param {Array} tools - Tool definitions (optional)
   * @param {Object} options - { temperature, max_tokens, tool_choice }
   */
  async chat(messages, tools = [], options = {}) {
    if (!this.isConfigured()) {
      throw new Error("groq_api_key_invalid");
    }

    const {
      temperature = 0.7,
      max_tokens = 500,
      tool_choice = "auto",
    } = options;

    try {
      const completion = await this.groq.chat.completions.create({
        messages,
        model: this.model,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? tool_choice : undefined,
        temperature,
        max_tokens,
      });

      return completion.choices[0];
    } catch (error) {
      this.handleError(error);
    }
  }

  handleError(error) {
    console.error("Groq API Error:", {
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type,
    });

    if (error.status === 401) {
      throw new Error("groq_api_key_invalid");
    }
    if (error.status === 429) {
      throw new Error("groq_rate_limit_exceeded");
    }

    // Pass through 400 errors (often tool use errors) for handling by the caller/parser
    if (error.status === 400) {
      // Enhance error object with failed_generation if present
      const match = error.message.match(/"failed_generation":"(.*?)"/);
      if (match) {
        error.failedGeneration = match[1]
          .replace(/\\"/g, '"')
          .replace(/\\n/g, "\n");
      }
      throw error;
    }

    throw new Error("groq_api_error");
  }
}

module.exports = new AIClient();

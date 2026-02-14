const aiClient = require("./client");
const aiParser = require("./parser");
const { getBankingTools } = require("./tools/banking");
const { SYSTEM_PROMPT } = require("./prompts");

/**
 * Modular AI Service
 * Coordinates Client, Parser, and Tools
 */
class AIService {
  constructor() {
    this.tools = [...getBankingTools()];
  }

  /**
   * Process a message with AI
   * @param {string} userMessage - The user's input
   * @param {Array} conversationHistory - Context
   * @returns {Promise<Object>} - Structured response { type, content, ... }
   */
  async processMessage(userMessage, conversationHistory = []) {
    // Construct messages
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    console.info("🤖 AI Processing Message", {
      historyLength: conversationHistory.length,
      messageLength: userMessage.length,
    });

    try {
      // 1. Call API
      const choice = await aiClient.chat(messages, this.tools);

      // 2. Parse Response (handles standard + hallucinations)
      const result = aiParser.parse(choice);

      console.info("AI Result Type:", result.type);
      if (result.type === "function_call") {
        console.info("AI Function Call:", result.function);
      }

      return result;
    } catch (error) {
      console.error("❌ AI Service failed:", error.message);

      // Check for previously enriched 400 error
      if (error.failedGeneration) {
        console.warn("⚠️ Attempting deep recovery from failed_generation...");
        const recovery = aiParser.tryParseHallucination(error.failedGeneration);
        if (recovery) {
          console.log("✅ Recovered from 400 Error!");
          return recovery;
        }
      }

      throw error; // Re-throw to be handled by webChatService
    }
  }

  /**
   * Generate a natural language response after executing a function
   * @param {string} functionName
   * @param {Object} functionResult
   * @param {Array} conversationHistory
   */
  async generateResponseFromFunction(
    functionName,
    functionResult,
    conversationHistory = [],
  ) {
    try {
      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...conversationHistory,
        // Inject function result as a specialized message
        {
          role: "function",
          name: functionName,
          content: JSON.stringify(functionResult),
        },
      ];

      // Call without tools for the final response to avoid loops
      const choice = await aiClient.chat(messages, [], { max_tokens: 400 });
      return choice.message.content;
    } catch (error) {
      console.error("Error generating function response:", error.message);
      return "I've processed that request, but I'm having trouble generating a summary right now.";
    }
  }
}

module.exports = new AIService();

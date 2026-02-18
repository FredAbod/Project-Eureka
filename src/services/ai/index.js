const aiClient = require("./client");
const aiParser = require("./parser");
const { getBankingTools } = require("./tools/banking");
const memoryTools = require("./tools/memory");
const memoryService = require("./memoryService");
const { SYSTEM_PROMPT, SUMMARY_PROMPT } = require("./prompts");

/**
 * Modular AI Service
 * Coordinates Client, Parser, and Tools
 */
class AIService {
  constructor() {
    this.tools = [...getBankingTools(), ...memoryTools];
  }

  /**
   * Process a message with AI
   * @param {string} userMessage - The user's input
   * @param {Array} conversationHistory - Context
   * @param {string} userId - User ID for memory retrieval
   * @returns {Promise<Object>} - Structured response { type, content, ... }
   */
  async processMessage(userMessage, conversationHistory = [], userId = null, userContext = null) {
    // 0. Build system prompt with user context
    let systemPrompt = SYSTEM_PROMPT;

    if (userContext && userContext.firstName) {
      systemPrompt += `\n\n[USER CONTEXT]\nUser's first name: ${userContext.firstName}\nFull name: ${userContext.name || userContext.firstName}\nAlways address the user as "${userContext.firstName}".`;
    }

    if (userId) {
      const rules = await memoryService.getRelevantRules(userId, userMessage);
      if (rules.length > 0) {
        systemPrompt += `\n\n[USER MEMORY & PREFERENCES]\nThe user has taught you the following:\n- ${rules.join("\n- ")}\nApply these rules to your response.`;
      }
    }

    // Construct messages
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    console.info("🤖 AI Processing Message", {
      historyLength: conversationHistory.length,
      messageLength: userMessage.length,
      userId,
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
   * @param {string} toolCallId - The tool call ID for proper message format
   */
  async generateResponseFromFunction(
    functionName,
    functionResult,
    conversationHistory = [],
    toolCallId = null,
  ) {
    try {
      // Only keep the last 4 messages to provide minimal context
      // and prevent old conversation topics from contaminating the summary
      const recentHistory = conversationHistory.slice(-4);

      const messages = [
        {
          role: "system",
          content:
            SUMMARY_PROMPT +
            `\n\nCURRENT TASK: Summarize the result of the \`${functionName}\` function ONLY. Do not reference any other actions or topics from conversation history.`,
        },
        ...recentHistory,
      ];

      // Use proper tool call format so the model understands the flow
      const callId = toolCallId || `summary_${Date.now()}`;
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: callId,
            type: "function",
            function: {
              name: functionName,
              arguments: "{}",
            },
          },
        ],
      });
      messages.push({
        role: "tool",
        tool_call_id: callId,
        content: JSON.stringify(functionResult),
      });

      const choice = await aiClient.chat(messages, [], { max_tokens: 400 });

      return aiParser.sanitizeContent(choice.message.content);
    } catch (error) {
      console.error("Error generating function response:", error.message);
      return "I've processed that request, but I'm having trouble generating a summary right now.";
    }
  }
}

module.exports = new AIService();

/**
 * Conversation Service
 * Manages conversation history and context
 */
const Session = require("../models/Session");

class ConversationService {
  async getConversationHistory(phoneNumber) {
    // Return empty array for now or fetch from DB if needed
    return [];
  }

  async addUserMessage(phoneNumber, text) {
    // Logic to store user message
    console.log(`[Conversation] User (${phoneNumber}): ${text}`);
  }

  async addAssistantMessage(phoneNumber, text) {
    // Logic to store assistant message
    console.log(`[Conversation] Assistant (${phoneNumber}): ${text}`);
  }

  formatForGroq(history) {
    return history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  async addFunctionResult(phoneNumber, functionName, result) {
    console.log(`[Conversation] Function (${functionName}):`, result);
  }
}

module.exports = new ConversationService();

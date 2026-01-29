/**
 * Conversation Service
 * Manages conversation history and context using Session model
 */
const Session = require("../models/Session");
const sessionRepo = require("../repositories/sessionRepository");

const MAX_HISTORY = 20;

class ConversationService {
  /**
   * Get conversation history from session
   */
  async getConversationHistory(phoneNumber) {
    try {
      const session = await Session.findOne({ from: phoneNumber });
      if (!session || !session.messages) {
        return [];
      }
      return session.messages.slice(-MAX_HISTORY);
    } catch (error) {
      console.error("[Conversation] Error fetching history:", error);
      return [];
    }
  }

  /**
   * Add a user message to history
   */
  async addUserMessage(phoneNumber, text) {
    try {
      console.log(`[Conversation] User (${phoneNumber}): ${text}`);
      await this.addMessageToSession(phoneNumber, {
        role: "user",
        content: text,
      });
    } catch (error) {
      console.error("[Conversation] Error adding user message:", error);
    }
  }

  /**
   * Add an assistant message to history
   */
  async addAssistantMessage(phoneNumber, text) {
    try {
      console.log(`[Conversation] Assistant (${phoneNumber}): ${text}`);
      await this.addMessageToSession(phoneNumber, {
        role: "assistant",
        content: text,
      });
    } catch (error) {
      console.error("[Conversation] Error adding assistant message:", error);
    }
  }

  /**
   * Add a function result to history (for AI context)
   */
  async addFunctionResult(phoneNumber, functionName, result) {
    try {
      console.log(`[Conversation] Function (${functionName}):`, result);
      await this.addMessageToSession(phoneNumber, {
        role: "function",
        name: functionName,
        content: JSON.stringify(result),
      });
    } catch (error) {
      console.error("[Conversation] Error adding function result:", error);
    }
  }

  /**
   * Core method to append message to session
   */
  async addMessageToSession(phoneNumber, messageObj) {
    const session = await sessionRepo.getOrCreate(phoneNumber);

    // Ensure messages array exists
    if (!session.messages) {
      session.messages = [];
    }

    session.messages.push({
      ...messageObj,
      timestamp: new Date(),
    });

    // Trim history if too long to save space
    if (session.messages.length > MAX_HISTORY * 2) {
      session.messages = session.messages.slice(-MAX_HISTORY);
    }

    session.lastActivity = new Date();
    await session.save();
  }

  /**
   * Format history for Groq API
   */
  formatForGroq(history) {
    return history.map((msg) => {
      const formatted = {
        role: msg.role,
        content: msg.content,
      };

      // Add name for function messages
      if (msg.role === "function" && msg.name) {
        formatted.name = msg.name;
      }

      return formatted;
    });
  }
}

module.exports = new ConversationService();

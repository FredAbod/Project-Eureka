const AiRule = require("../../models/AiRule");

/**
 * AI Memory Service
 * Handles storing and retrieving learned rules.
 */
class MemoryService {
  /**
   * Save a new rule
   * @param {string} userId
   * @param {string} key
   * @param {string} value
   * @param {string} category
   */
  async learnRule(userId, key, value, category = "fact") {
    try {
      // Upsert rule (overwrite if key exists for user)
      const rule = await AiRule.findOneAndUpdate(
        { userId, key: key.toLowerCase() },
        { value, category, confidence: 1.0, updatedAt: Date.now() },
        { upsert: true, new: true },
      );

      console.log(`🧠 AI Learned: "${key}" = "${value}"`);
      return { success: true, rule };
    } catch (error) {
      console.error("Memory save failed:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Retrieve relevant rules for a context
   * @param {string} userId
   * @param {string} message - User message to match against keywords (simple implementation)
   */
  async getRelevantRules(userId, message) {
    try {
      // Retrieve all rules for user (naive, but fine for prototype)
      // Optimization: Text search or embeddings in Phase 12
      const rules = await AiRule.find({
        $or: [{ userId }, { userId: null }], // User + Global rules
      }).limit(50);

      // Filter in-memory for simple keyword matching
      // If message contains the key, it's relevant
      const relevant = rules.filter((r) =>
        message.toLowerCase().includes(r.key.toLowerCase()),
      );

      return relevant.map((r) => `${r.key}: ${r.value}`);
    } catch (error) {
      console.error("Memory retrieval failed:", error);
      return [];
    }
  }
}

module.exports = new MemoryService();

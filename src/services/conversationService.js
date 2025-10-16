const sessionRepo = require('../repositories/sessionRepository');

// Maximum number of messages to keep in context window
const MAX_CONTEXT_MESSAGES = 10;

// Maximum age of conversation before it's considered "stale" (30 minutes)
const CONVERSATION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Get conversation history for a session
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<Array>} - Array of messages in Groq format
 */
async function getConversationHistory(phoneNumber) {
  try {
    const session = await sessionRepo.getByPhone(phoneNumber);
    
    if (!session || !session.conversationHistory) {
      return [];
    }

    // Check if conversation is stale
    const lastActivity = session.lastAccessed || 0;
    const isStale = Date.now() - lastActivity > CONVERSATION_TIMEOUT_MS;
    
    if (isStale) {
      console.info('Conversation is stale, starting fresh', { phoneNumber });
      return [];
    }

    // Return last N messages (to keep context window manageable)
    const history = session.conversationHistory || [];
    return history.slice(-MAX_CONTEXT_MESSAGES);

  } catch (error) {
    console.error('Error getting conversation history:', error);
    return [];
  }
}

/**
 * Add a message to conversation history
 * @param {string} phoneNumber - User's phone number
 * @param {string} role - Message role (user, assistant, function)
 * @param {string} content - Message content
 * @returns {Promise<void>}
 */
async function addMessage(phoneNumber, role, content) {
  try {
    const session = await sessionRepo.getByPhone(phoneNumber);
    
    if (!session) {
      console.warn('Cannot add message: session not found', { phoneNumber });
      return;
    }

    const message = {
      role,
      content,
      timestamp: Date.now()
    };

    // Get existing history or initialize empty array
    const history = session.conversationHistory || [];
    
    // Add new message
    history.push(message);

    // Keep only last MAX_CONTEXT_MESSAGES to prevent unbounded growth
    const trimmedHistory = history.slice(-MAX_CONTEXT_MESSAGES);

    // Update session with new history
    await sessionRepo.updateSession(phoneNumber, {
      conversationHistory: trimmedHistory
    });

    console.info('Message added to conversation', {
      phoneNumber,
      role,
      historySize: trimmedHistory.length
    });

  } catch (error) {
    console.error('Error adding message to conversation:', error);
    // Don't throw - conversation history is not critical
  }
}

/**
 * Add a user message
 * @param {string} phoneNumber 
 * @param {string} content 
 */
async function addUserMessage(phoneNumber, content) {
  return addMessage(phoneNumber, 'user', content);
}

/**
 * Add an assistant response
 * @param {string} phoneNumber 
 * @param {string} content 
 */
async function addAssistantMessage(phoneNumber, content) {
  return addMessage(phoneNumber, 'assistant', content);
}

/**
 * Add a function call result to history
 * @param {string} phoneNumber 
 * @param {string} functionName 
 * @param {Object} result 
 */
async function addFunctionResult(phoneNumber, functionName, result) {
  const content = `Function ${functionName} returned: ${JSON.stringify(result)}`;
  return addMessage(phoneNumber, 'function', content);
}

/**
 * Clear conversation history for a user
 * @param {string} phoneNumber 
 */
async function clearConversation(phoneNumber) {
  try {
    await sessionRepo.updateSession(phoneNumber, {
      conversationHistory: []
    });
    console.info('Conversation cleared', { phoneNumber });
  } catch (error) {
    console.error('Error clearing conversation:', error);
  }
}

/**
 * Format conversation history for Groq API
 * Removes timestamps and ensures proper format
 * @param {Array} history - Raw history from database
 * @returns {Array} - Formatted for Groq
 */
function formatForGroq(history) {
  if (!history || !Array.isArray(history)) {
    return [];
  }

  return history.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}

/**
 * Get conversation statistics
 * @param {string} phoneNumber 
 * @returns {Promise<Object>}
 */
async function getConversationStats(phoneNumber) {
  try {
    const session = await sessionRepo.getByPhone(phoneNumber);
    
    if (!session) {
      return { messageCount: 0, isActive: false };
    }

    const history = session.conversationHistory || [];
    const lastActivity = session.lastAccessed || 0;
    const isActive = Date.now() - lastActivity < CONVERSATION_TIMEOUT_MS;

    return {
      messageCount: history.length,
      isActive,
      lastActivity: new Date(lastActivity).toISOString(),
      userMessages: history.filter(m => m.role === 'user').length,
      assistantMessages: history.filter(m => m.role === 'assistant').length
    };

  } catch (error) {
    console.error('Error getting conversation stats:', error);
    return { messageCount: 0, isActive: false, error: error.message };
  }
}

/**
 * Check if user has an active conversation
 * @param {string} phoneNumber 
 * @returns {Promise<boolean>}
 */
async function hasActiveConversation(phoneNumber) {
  const stats = await getConversationStats(phoneNumber);
  return stats.isActive && stats.messageCount > 0;
}

module.exports = {
  getConversationHistory,
  addMessage,
  addUserMessage,
  addAssistantMessage,
  addFunctionResult,
  clearConversation,
  formatForGroq,
  getConversationStats,
  hasActiveConversation,
  MAX_CONTEXT_MESSAGES,
  CONVERSATION_TIMEOUT_MS
};

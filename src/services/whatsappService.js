/**
 * WhatsApp Service
 * Handles WhatsApp Cloud API interactions
 */

// Node.js v18+ has native fetch, no need to require node-fetch

class WhatsAppService {
  constructor() {
    this.apiUrl = process.env.WHATSAPP_API_URL;
    this.apiToken = process.env.WHATSAPP_API_TOKEN;
    this.verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'change_me';
  }

  /**
   * Send a text message via WhatsApp
   */
  async sendMessage(to, text) {
    try {
      if (!this.apiUrl || !this.apiToken) {
        console.warn('⚠️ WhatsApp API not configured. Message not sent.');
        return { success: false, error: 'WhatsApp API not configured' };
      }

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: text }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to send message');
      }

      console.log('✅ Message sent to', to);
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      console.error('❌ Error sending WhatsApp message:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify webhook token
   */
  verifyWebhook(mode, token) {
    return mode === 'subscribe' && token === this.verifyToken;
  }

  /**
   * Process incoming webhook message
   */
  async processWebhook(body) {
    try {
      // Extract message details
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;

      if (!messages || messages.length === 0) {
        return { success: true, message: 'No messages to process' };
      }

      const message = messages[0];
      const from = message.from; // Phone number
      const messageBody = message.text?.body || '';
      const messageType = message.type;

      console.log(`📨 Received ${messageType} message from ${from}: ${messageBody}`);

      // Process the message (placeholder for now)
      // TODO: Add AI processing and Mono integration here
      const response = await this.handleMessage(from, messageBody);

      // Send response back to user
      if (response) {
        await this.sendMessage(from, response);
      }

      return { success: true, message: 'Webhook processed' };
    } catch (error) {
      console.error('❌ Error processing webhook:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle incoming message and generate response
   * TODO: Integrate with Groq AI and Mono banking
   */
  async handleMessage(phoneNumber, message) {
    const text = message.toLowerCase();

    // Basic responses for now
    if (text.includes('hello') || text.includes('hi')) {
      return '👋 Hello! Welcome to Eureka Banking. I can help you with:\n\n' +
             '🏦 Link your bank account\n' +
             '💰 Check your balance\n' +
             '📊 View transactions\n' +
             '💸 Transfer money\n\n' +
             'What would you like to do?';
    }

    if (text.includes('help')) {
      return 'Here are the commands you can use:\n\n' +
             '• "link account" - Connect your bank\n' +
             '• "check balance" - View your balance\n' +
             '• "transactions" - See recent transactions\n' +
             '• "help" - Show this message';
    }

    // Default response
    return 'I understand you said: "' + message + '"\n\n' +
           'I\'m still learning! For now, try saying "help" to see what I can do.';
  }
}

module.exports = new WhatsAppService();

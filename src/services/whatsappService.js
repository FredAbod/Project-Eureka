/**
 * WhatsApp Service
 * Handles WhatsApp Cloud API interactions
 */

// Node.js v18+ has native fetch, no need to require node-fetch
const webhookService = require("./webhookService");

class WhatsAppService {
  constructor() {
    this.apiUrl = process.env.WHATSAPP_API_URL;
    this.apiToken = process.env.WHATSAPP_API_TOKEN;
    this.verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "change_me";
  }

  /**
   * Send a text message via WhatsApp
   */
  async sendMessage(to, text) {
    try {
      if (!this.apiUrl || !this.apiToken) {
        console.warn("⚠️ WhatsApp API not configured. Message not sent.");
        return { success: false, error: "WhatsApp API not configured" };
      }

      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to,
          type: "text",
          text: { body: text },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to send message");
      }

      console.log("✅ Message sent to", to);
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      console.error("❌ Error sending WhatsApp message:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify webhook token
   */
  verifyWebhook(mode, token) {
    return mode === "subscribe" && token === this.verifyToken;
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
        return { success: true, message: "No messages to process" };
      }

      const message = messages[0];
      const from = message.from; // Phone number
      const messageBody = message.text?.body || "";
      const messageType = message.type;

      console.log(
        `📨 Received ${messageType} message from ${from}: ${messageBody}`
      );

      // Only process text messages for now
      if (messageType !== "text") {
        console.log("Skipping non-text message");
        return { success: true, message: "Skipped non-text message" };
      }

      // Delegate processing to the webhook service (AI & Business Logic)
      const result = await webhookService.handleEvent({
        from: from,
        text: messageBody,
      });

      // Send response back to user if there is a text response
      if (result && result.text) {
        await this.sendMessage(from, result.text);
      }

      return { success: true, message: "Webhook processed" };
    } catch (error) {
      console.error("❌ Error processing webhook:", error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new WhatsAppService();

/**
 * Webhook Controller
 * Handles WhatsApp webhook verification and message processing
 */

const whatsappService = require('../services/whatsappService');

/**
 * Verify webhook endpoint (GET)
 * WhatsApp will call this to verify your webhook URL
 */
const verifyWebhook = (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('🔍 Webhook verification request:', { mode, token });

    if (whatsappService.verifyWebhook(mode, token)) {
      console.log('✅ Webhook verified');
      res.status(200).send(challenge);
    } else {
      console.log('❌ Webhook verification failed');
      res.status(403).json({ error: 'Forbidden' });
    }
  } catch (error) {
    console.error('❌ Error in webhook verification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Handle incoming webhook messages (POST)
 */
const handleWebhook = async (req, res) => {
  try {
    // Acknowledge receipt immediately
    res.status(200).json({ ok: true });

    // Process webhook asynchronously
    const result = await whatsappService.processWebhook(req.body);

    if (!result.success) {
      console.error('❌ Webhook processing failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error handling webhook:', error);
    // Already sent 200, so just log the error
  }
};

module.exports = {
  verifyWebhook,
  handleWebhook
};

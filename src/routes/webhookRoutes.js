/**
 * Webhook Routes
 * WhatsApp Cloud API webhook endpoints
 */

const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

/**
 * @route   GET /webhook
 * @desc    Verify webhook (WhatsApp webhook verification)
 * @access  Public
 */
router.get('/', webhookController.verifyWebhook);

/**
 * @route   POST /webhook
 * @desc    Handle incoming WhatsApp messages
 * @access  Public
 */
router.post('/', webhookController.handleWebhook);

module.exports = router;

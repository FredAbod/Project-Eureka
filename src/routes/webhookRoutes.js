const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// GET /webhook - used by WhatsApp Cloud API to verify webhook (hub.challenge)
router.get('/', webhookController.verify);

// POST /webhook - receive incoming messages
router.post('/', webhookController.receive);

module.exports = router;

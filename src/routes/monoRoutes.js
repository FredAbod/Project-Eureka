/**
 * Mono Routes
 * API routes for Mono bank account operations
 */

const express = require('express');
const router = express.Router();
const monoController = require('../controllers/monoController');

/**
 * @route   POST /api/mono/initiate
 * @desc    Initiate bank account linking
 * @access  Public
 * @body    { phoneNumber, name, email }
 */
router.post('/initiate', monoController.initiateAccountLinking);

/**
 * @route   GET /api/mono/callback
 * @desc    Handle Mono callback after successful account linking
 * @access  Public
 * @query   code - Authorization code from Mono
 */
router.get('/callback', monoController.handleCallback);

/**
 * @route   POST /api/mono/link-account
 * @desc    Complete account linking (exchange code and save to DB)
 * @access  Public
 * @body    { code, phoneNumber }
 */
router.post('/link-account', monoController.linkAccount);

/**
 * @route   GET /api/mono/accounts
 * @desc    Get all linked accounts for a user
 * @access  Public
 * @query   phoneNumber - User's phone number
 */
router.get('/accounts', monoController.getLinkedAccounts);

/**
 * @route   GET /api/mono/balance/:accountId
 * @desc    Get account balance
 * @access  Public
 * @param   accountId - Bank account ID from database
 */
router.get('/balance/:accountId', monoController.getBalance);

/**
 * @route   GET /api/mono/transactions/:accountId
 * @desc    Get transaction history
 * @access  Public
 * @param   accountId - Bank account ID from database
 * @query   page, start, end - Optional filters
 */
router.get('/transactions/:accountId', monoController.getTransactions);

/**
 * @route   POST /api/mono/sync/:accountId
 * @desc    Sync account data from Mono
 * @access  Public
 * @param   accountId - Bank account ID from database
 */
router.post('/sync/:accountId', monoController.syncAccount);

/**
 * @route   DELETE /api/mono/unlink/:accountId
 * @desc    Unlink a bank account
 * @access  Public
 * @param   accountId - Bank account ID from database
 */
router.delete('/unlink/:accountId', monoController.unlinkAccount);

/**
 * @route   GET /api/mono/banks
 * @desc    Get list of supported banks
 * @access  Public
 */
router.get('/banks', monoController.getBanks);

module.exports = router;

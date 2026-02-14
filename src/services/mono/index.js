const client = require("./client");
const auth = require("./auth");
const accounts = require("./accounts");
const lookup = require("./lookup");
const payments = require("./payments");
const mandates = require("./mandates");

/**
 * Mono Service Facade
 * Unifies all modular Mono services into a single interface.
 * Maintains backward compatibility with the original MonoService.
 */
class MonoServiceFacade {
  constructor() {
    this.client = client;
    this.auth = auth;
    this.accounts = accounts;
    this.lookup = lookup;
    this.payments = payments;
    this.mandates = mandates;

    // Direct property access for legacy code that might check keys
    this.secretKey = client.secretKey;
    this.publicKey = client.publicKey;
    this.baseUrl = client.baseUrl;
  }

  // --- Auth ---
  initiateAccountLinking(customer, redirectUrl, ref) {
    return this.auth.initiateAccountLinking(customer, redirectUrl, ref);
  }
  exchangeToken(code) {
    return this.auth.exchangeToken(code);
  }
  initiateReauth(accountId, redirectUrl, ref) {
    return this.auth.initiateReauth(accountId, redirectUrl, ref);
  }

  // --- Accounts ---
  getAccountDetails(accountId) {
    return this.accounts.getAccountDetails(accountId);
  }
  getBalance(accountId) {
    return this.accounts.getBalance(accountId);
  }
  getTransactions(accountId, options) {
    return this.accounts.getTransactions(accountId, options);
  }
  getStatement(accountId, options) {
    return this.accounts.getStatement(accountId, options);
  }
  getIdentity(accountId) {
    return this.accounts.getIdentity(accountId);
  }
  unlinkAccount(accountId) {
    return this.accounts.unlinkAccount(accountId);
  }
  syncAccount(accountId) {
    return this.accounts.syncAccount(accountId);
  }

  // --- Lookup ---
  getBanks() {
    return this.lookup.getBanks();
  }
  lookupBankAccount(acc, bank) {
    return this.lookup.lookupBankAccount(acc, bank);
  }

  // --- Payments ---
  initiatePayment(options) {
    return this.payments.initiatePayment(options);
  }
  verifyPayment(ref) {
    return this.payments.verifyPayment(ref);
  }
  initiatePayout(options) {
    return this.payments.initiatePayout(options);
  }

  // --- Mandates ---
  initiateMandate(options) {
    return this.mandates.initiateMandate(options);
  }
  createMandate(options) {
    return this.mandates.createMandate(options);
  }
  verifyMandateBalance(id, amt) {
    return this.mandates.verifyMandateBalance(id, amt);
  }
  checkMandateBalance(id, amt) {
    return this.mandates.checkMandateBalance(id, amt);
  }
  debitMandate(id, amt, ref, narr, ben) {
    return this.mandates.debitMandate(id, amt, ref, narr, ben);
  }
  debitWithBeneficiary(options) {
    return this.mandates.debitWithBeneficiary(options);
  }
  getMandate(id) {
    return this.mandates.getMandate(id);
  }

  // --- Helpers ---
  getHeaders() {
    return this.client.getHeaders();
  }
  getV3Headers() {
    return this.client.getV3Headers();
  }
}

module.exports = new MonoServiceFacade();

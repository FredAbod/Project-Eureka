/**
 * Account Connection Service
 * Handles linking bank accounts
 */

class AccountConnectionService {
  async getConnectionStatus(phoneNumber) {
    return { connected: true, message: "Account connected" };
  }

  async isAccountConnected(phoneNumber) {
    return true;
  }

  async initiateConnection(phoneNumber) {
    return { success: true, message: "Connection link sent" };
  }

  async cancelConnection(phoneNumber) {
    return { message: "Connection cancelled" };
  }

  async handleConnectionInput(phoneNumber, text) {
    return { message: null }; // Pass through to AI
  }
}

module.exports = new AccountConnectionService();

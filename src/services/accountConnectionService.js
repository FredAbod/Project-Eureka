const User = require("../models/User");

class AccountConnectionService {
  async getConnectionStatus(phoneNumber) {
    try {
      const user = await User.findOne({ phoneNumber });

      if (!user) {
        return { connected: false, message: "User not found" };
      }

      // Check if user has any linked accounts
      const isConnected = user.linkedAccounts && user.linkedAccounts.length > 0;

      return {
        connected: isConnected,
        message: isConnected ? "Account connected" : "Not connected",
      };
    } catch (error) {
      console.error("Get connection status error:", error);
      return { connected: false, message: "Error checking status" };
    }
  }

  async isAccountConnected(phoneNumber) {
    const status = await this.getConnectionStatus(phoneNumber);
    return status.connected;
  }

  async initiateConnection(phoneNumber) {
    return {
      success: true,
      message:
        "To connect your account, please use the legitimate Eureka app or wait for the integration to be fully live.",
    };
  }

  async cancelConnection(phoneNumber) {
    return { message: "Connection cancelled" };
  }

  async handleConnectionInput(phoneNumber, text) {
    return { message: null }; // Pass through to AI
  }
}

module.exports = new AccountConnectionService();

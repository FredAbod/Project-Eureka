const User = require("../models/User");
const monoService = require("./monoService");

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
    try {
      const user = await User.findOne({ phoneNumber });
      if (!user) {
        return { success: false, message: "User not found" };
      }

      // Use the backend API URL (port 4000) for the callback
      const baseUrl = process.env.BASE_URL_API || "http://localhost:4000";
      const ref = `user_${user._id}_${Date.now()}`;
      const redirectUrl = `${baseUrl}/api/mono/callback?reference=${ref}`;

      const result = await monoService.initiateAccountLinking(
        {
          name: user.name,
          email: user.email,
          phone: user.phoneNumber,
          // Note: address not sent here - /accounts/initiate doesn't accept it
          // We'll update customer after account linking succeeds
        },
        redirectUrl,
        ref, // Pass user_<id> format for webhooks
      );

      if (result.success) {
        // Update customer with address after linking succeeds (for mandate support)
        // This happens asynchronously - don't block the response
        if (result.customerId) {
          monoService
            .updateCustomer(result.customerId, {
              address: "Lagos, Nigeria", // TODO: Get from user profile or bank account
            })
            .catch((err) =>
              console.warn("⚠️ Failed to update customer address:", err.message),
            );
        }

        return {
          success: true,
          message: `Please use this link to securely connect your bank account: ${result.monoUrl}`,
          monoUrl: result.monoUrl,
        };
      } else {
        return {
          success: false,
          message:
            "Sorry, I couldn't generate a connection link right now. Please try again later.",
        };
      }
    } catch (error) {
      console.error("Initiate connection error:", error);
      return {
        success: false,
        message: "Server error while initiating connection.",
      };
    }
  }

  async cancelConnection(phoneNumber) {
    return { message: "Connection cancelled" };
  }

  async handleConnectionInput(phoneNumber, text) {
    return { message: null }; // Pass through to AI
  }
}

module.exports = new AccountConnectionService();

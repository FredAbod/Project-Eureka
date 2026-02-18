const sessionRepo = require("../../repositories/sessionRepository");
const bankLookupService = require("../bankLookupService");
const monoService = require("../monoService");
const conversationService = require("../conversationService");
const { logBankingOperation } = require("../../middleware/auditLogger");
const User = require("../../models/User");
const BankAccount = require("../../models/BankAccount");

/**
 * Transaction Flow Service
 * Handles the state machine for complex banking transactions (Transfer, Confirmation, Execution)
 */
class TransactionFlowService {
  /**
   * Initiate a transfer request and set up pending state
   */
  async createTransferRequest(session, args, phoneNumber, ip, userId) {
    const {
      recipient_account_number,
      recipient_bank_code,
      recipient_name,
      amount,
    } = args;

    // 🛡️ ANTI-HALLUCINATION GUARDRAILS
    if (
      !recipient_account_number ||
      recipient_account_number === "null" ||
      recipient_account_number === "undefined" ||
      !recipient_bank_code ||
      recipient_bank_code === "null" ||
      recipient_bank_code === "undefined"
    ) {
      return {
        success: true,
        data: {
          response:
            "I need a bit more detail. What is the recipient's account number and bank?",
          timestamp: new Date().toISOString(),
          requiresConfirmation: false,
        },
      };
    }

    if (amount <= 0) {
      return {
        success: true,
        data: {
          response: "The transfer amount must be greater than zero.",
        },
      };
    }

    // Create pending state
    const pendingTransaction = {
      type: "transfer",
      arguments: args,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    };

    await sessionRepo.updateSession(phoneNumber, { pendingTransaction });

    // Get bank name for display
    const bank = bankLookupService.getBankByCode(recipient_bank_code);
    const bankName = bank ? bank.name : recipient_bank_code;

    logBankingOperation({
      userId,
      phoneNumber,
      action: "transfer_initiated",
      amount,
      status: "pending_confirmation",
      ip,
      metadata: {
        recipient_account_number,
        recipient_bank_code,
        recipient_name,
      },
    });

    const recipientDisplay =
      recipient_name || `Account ${recipient_account_number}`;
    const confirmMessage = `Transfer ₦${amount.toLocaleString()} to ${recipientDisplay} at ${bankName}? Reply "confirm" or "cancel".`;

    return {
      success: true,
      data: {
        response: confirmMessage,
        timestamp: new Date().toISOString(),
        requiresConfirmation: true,
        pendingAction: {
          type: "transfer",
          amount,
          recipientName: recipient_name,
          recipientAccount: recipient_account_number,
          recipientBank: bankName,
          expiresIn: 300,
        },
      },
    };
  }

  /**
   * Process confirmation or cancellation of a pending transaction
   */
  async handleConfirmation(session, text, phoneNumber, ip, userId) {
    const pending = session.pendingTransaction;

    // Check expiration
    if (Date.now() > pending.expiresAt) {
      await sessionRepo.updateSession(phoneNumber, {
        pendingTransaction: null,
      });
      return {
        success: true,
        data: {
          response: "Transaction confirmation expired. Please try again.",
          timestamp: new Date().toISOString(),
          requiresConfirmation: false,
        },
      };
    }

    const normalized = text.toLowerCase().trim();

    // CANCEL
    if (normalized === "cancel" || normalized === "no" || normalized === "n") {
      await sessionRepo.updateSession(phoneNumber, {
        pendingTransaction: null,
      });

      logBankingOperation({
        userId,
        phoneNumber,
        action: "transfer_cancelled",
        amount: pending.arguments.amount,
        status: "cancelled",
        ip,
      });

      return {
        success: true,
        data: {
          response:
            "Transfer cancelled. Is there anything else I can help you with?",
          timestamp: new Date().toISOString(),
          requiresConfirmation: false,
        },
      };
    }

    // CONFIRM
    if (
      normalized === "confirm" ||
      normalized === "yes" ||
      normalized === "y"
    ) {
      return await this.executeTransfer(pending, phoneNumber, ip, userId);
    }

    // INVALID INPUT
    return {
      success: true,
      data: {
        response:
          'Please reply "confirm" to proceed or "cancel" to cancel the transfer.',
        timestamp: new Date().toISOString(),
        requiresConfirmation: true,
      },
    };
  }

  /**
   * Execute the transfer after confirmation
   * @private
   */
  async executeTransfer(pending, phoneNumber, ip, userId) {
    const {
      recipient_account_number,
      recipient_bank_code,
      recipient_name,
      amount,
    } = pending.arguments;

    // Clear pending state immediately to prevent double execution
    await sessionRepo.updateSession(phoneNumber, { pendingTransaction: null });

    const bank = bankLookupService.getBankByCode(recipient_bank_code);
    const bankName = bank ? bank.name : recipient_bank_code;

    // 1. Get User & Account
    const user = await User.findById(userId);
    if (!user) return { success: true, data: { response: "User not found." } };

    const sourceAccount = await BankAccount.findOne({
      userId,
      isActive: true,
    });

    if (!sourceAccount) {
      return {
        success: true,
        data: {
          response: "No active bank account linked. Please link one first.",
        },
      };
    }

    // 2. Verify Recipient (Double Check)
    const recipientCheck = await bankLookupService.lookupAccount(
      recipient_account_number,
      recipient_bank_code,
    );

    if (!recipientCheck.success || !recipientCheck.accountName) {
      const msg = `❌ Could not verify recipient account ${recipient_account_number}. Please check details.`;
      await conversationService.addAssistantMessage(phoneNumber, msg);
      return { success: true, data: { response: msg } };
    }

    const verifiedRecipientName = recipientCheck.accountName;

    // 3. Authorization (Mandate) Check
    if (
      !sourceAccount.mandateStatus ||
      sourceAccount.mandateStatus !== "active"
    ) {
      return await this.handleMissingMandate(sourceAccount, user, phoneNumber);
    }

    // 4. Verify Balance
    const amountKobo = amount * 100;
    const balanceCheck = await monoService.verifyMandateBalance(
      sourceAccount.mandateId,
      amountKobo,
    );

    if (balanceCheck.hasSufficientBalance === false) {
      const msg = `❌ Insufficient funds. Your balance is too low.`;
      await conversationService.addAssistantMessage(phoneNumber, msg);
      return { success: true, data: { response: msg } };
    }

    // 5. Execute Debit
    const debitReference = `trn${Date.now()}${userId.toString().slice(-4)}`;
    const debitResult = await monoService.debitMandate(
      sourceAccount.mandateId,
      amountKobo,
      debitReference,
      `Transfer to ${verifiedRecipientName}`,
      {
        accountNumber: recipient_account_number,
        bankCode: recipient_bank_code,
      },
    );

    if (!debitResult.success) {
      const msg = `❌ Transfer failed: ${debitResult.error || "Unknown error"}`;
      await conversationService.addAssistantMessage(phoneNumber, msg);
      return { success: true, data: { response: msg } };
    }

    // 6. Success
    logBankingOperation({
      userId,
      phoneNumber,
      action: "transfer_completed",
      amount,
      status: "success",
      ip,
      metadata: {
        recipient_account_number,
        recipient_bank_code,
        recipient_name,
        reference: debitResult.reference,
      },
    });

    const responseText = `✅ Transfer complete! ₦${amount.toLocaleString()} sent to ${verifiedRecipientName} at ${bankName}.`;
    await conversationService.addAssistantMessage(phoneNumber, responseText);

    return {
      success: true,
      data: {
        response: responseText,
        timestamp: new Date().toISOString(),
        requiresConfirmation: false,
      },
    };
  }

  /**
   * Handle case where mandate is missing/inactive
   * @private
   */
  async handleMissingMandate(sourceAccount, user, phoneNumber) {
    console.log(
      `⚠️ No active mandate for account ${sourceAccount._id}. Initiating...`,
    );

    if (!sourceAccount.monoCustomerId) {
      console.error(
        "❌ No Mono customer ID on account. Cannot initiate mandate.",
      );
      return {
        success: true,
        data: {
          response:
            "Unable to set up authorization — your account is missing a customer ID. Please re-link your bank account first.",
        },
      };
    }

    // Try to initiate mandate
    let mandateResult = await monoService.initiateMandate({
      customerId: sourceAccount.monoCustomerId,
      description: "Eureka Transfer Authorization",
      reference: `auth${Date.now()}${user._id.toString().slice(-4)}`,
    });

    // If mandate fails due to missing phone/address, update customer and retry
    if (
      !mandateResult.success &&
      mandateResult.error &&
      mandateResult.error.includes("Phone number and address are required")
    ) {
      console.log(
        "⚠️ Customer missing phone/address. Updating customer record...",
      );

      const updateResult = await monoService.updateCustomer(
        sourceAccount.monoCustomerId,
        {
          phone: user.phoneNumber,
          address: "Lagos, Nigeria", // TODO: Get from user profile or bank account
        },
      );

      if (updateResult.success) {
        console.log("✅ Customer updated. Retrying mandate initiation...");
        // Retry mandate initiation
        mandateResult = await monoService.initiateMandate({
          customerId: sourceAccount.monoCustomerId,
          description: "Eureka Transfer Authorization",
          reference: `auth${Date.now()}${user._id.toString().slice(-4)}`,
        });
      } else {
        console.error("❌ Failed to update customer:", updateResult.error);
        // If update fails, user needs to re-link account to create new customer with phone/address
        return {
          success: true,
          data: {
            response:
              "To enable transfers, please re-link your bank account. This will update your account information. Say 'connect account' to get started.",
          },
        };
      }
    }

    if (mandateResult.success) {
      sourceAccount.mandateReference = mandateResult.reference;
      sourceAccount.mandateStatus = "pending";
      sourceAccount.mandateUrl = mandateResult.payment_link;
      await sourceAccount.save();

      const authResponse =
        `🚨 *Authorization Required*\n\n` +
        `To securely process this transfer, you need to authorize Eureka with your bank once.\n\n` +
        `👉 Please click here: ${mandateResult.payment_link}\n\n` +
        `After authorizing, please request the transfer again.`;

      await conversationService.addAssistantMessage(phoneNumber, authResponse);

      return {
        success: true,
        data: {
          response: authResponse,
          timestamp: new Date().toISOString(),
          requiresConfirmation: false,
        },
      };
    } else {
      console.error("❌ Mandate initiation failed:", mandateResult.error);
      return {
        success: true,
        data: {
          response: `Failed to initiate authorization: ${mandateResult.error || "Unknown error"}. Please try again later.`,
        },
      };
    }
  }
}

module.exports = new TransactionFlowService();

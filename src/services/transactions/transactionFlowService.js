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
  async createTransferRequest(
    session,
    args,
    phoneNumber,
    ip,
    userId,
    fromAccountId = null,
  ) {
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

    // Determine source account when user has multiple accounts
    // Prefer explicit from_account_id (from tool args) when provided
    let sourceAccountId = fromAccountId || args.from_account_id || null;
    const activeAccounts = await BankAccount.find({
      userId,
      isActive: true,
    }).sort({ isPrimary: -1, createdAt: -1 });

    if (!activeAccounts || activeAccounts.length === 0) {
      return {
        success: true,
        data: {
          response:
            "You don't have any active bank accounts linked yet. Please link an account first.",
          timestamp: new Date().toISOString(),
          requiresConfirmation: false,
        },
      };
    }

    if (sourceAccountId) {
      const match = activeAccounts.find(
        (acc) => acc._id.toString() === String(sourceAccountId),
      );
      if (!match) {
        return {
          success: true,
          data: {
            response:
              "I couldn't find the bank account you selected. Please choose one of your active accounts.",
            timestamp: new Date().toISOString(),
            requiresConfirmation: false,
          },
        };
      }
      // Persist the chosen source account on the arguments
      args.from_account_id = match._id.toString();
    } else if (activeAccounts.length === 1) {
      // Only one active account – use it implicitly but record it for executeTransfer
      args.from_account_id = activeAccounts[0]._id.toString();
    } else {
      // Multiple active accounts and no explicit choice -> ask the user to pick
      const accountOptions = activeAccounts.map((acc) => ({
        id: acc._id.toString(),
        bankName: acc.bankName || "Bank account",
        last4:
          acc.accountNumber && acc.accountNumber.length >= 4
            ? acc.accountNumber.slice(-4)
            : "****",
      }));

      const pendingTransaction = {
        type: "choose_source_account",
        arguments: args,
        accounts: accountOptions,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      };

      await sessionRepo.updateSession(phoneNumber, { pendingTransaction });

      const listText = accountOptions
        .map(
          (opt, idx) =>
            `${idx + 1}) ${opt.bankName} ****${opt.last4} (ID: ${opt.id})`,
        )
        .join("\n");

      const msg =
        "You have multiple connected accounts. Which account should I use as the source for this transfer?\n\n" +
        listText +
        "\n\nReply with the number (e.g. 1 or 2), or type \"cancel\" to stop.";

      await conversationService.addAssistantMessage(phoneNumber, msg);

      return {
        success: true,
        data: {
          response: msg,
          timestamp: new Date().toISOString(),
          requiresConfirmation: true,
          pendingAction: {
            type: "choose_source_account",
            accounts: accountOptions,
            expiresIn: 300,
          },
        },
      };
    }

    // Create pending state for the actual transfer
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

    // Special flow: user choosing which source account to use
    if (pending.type === "choose_source_account") {
      // CANCEL
      if (
        normalized === "cancel" ||
        normalized === "no" ||
        normalized === "n"
      ) {
        await sessionRepo.updateSession(phoneNumber, {
          pendingTransaction: null,
        });

        logBankingOperation({
          userId,
          phoneNumber,
          action: "source_account_selection_cancelled",
          status: "cancelled",
          ip,
        });

        return {
          success: true,
          data: {
            response:
              "Okay, I won't proceed with that transfer. Is there anything else I can help you with?",
            timestamp: new Date().toISOString(),
            requiresConfirmation: false,
          },
        };
      }

      // Interpret numeric choice (1, 2, 3, ...)
      const choiceIndex = parseInt(normalized, 10);
      if (
        Number.isNaN(choiceIndex) ||
        choiceIndex < 1 ||
        choiceIndex > (pending.accounts || []).length
      ) {
        return {
          success: true,
          data: {
            response:
              'Please reply with the number of the account you want to use (e.g. "1" or "2"), or type "cancel" to stop.',
            timestamp: new Date().toISOString(),
            requiresConfirmation: true,
          },
        };
      }

      const selected = pending.accounts[choiceIndex - 1];
      const args = pending.arguments || {};

      // Create a new transfer pending state with the chosen source account
      const newPending = {
        type: "transfer",
        arguments: {
          ...args,
          from_account_id: selected.id,
        },
        expiresAt: Date.now() + 5 * 60 * 1000,
      };

      await sessionRepo.updateSession(phoneNumber, {
        pendingTransaction: newPending,
      });

      const bank = bankLookupService.getBankByCode(
        args.recipient_bank_code || args.bank_code,
      );
      const destBankName = bank
        ? bank.name
        : args.recipient_bank_code || args.bank_name || "the bank";

      const recipientDisplay =
        args.recipient_name || `Account ${args.recipient_account_number}`;
      const confirmMessage = `Great — we'll use ${selected.bankName} ****${selected.last4} as the source account.\n\nTransfer ₦${Number(
        args.amount,
      ).toLocaleString()} to ${recipientDisplay} at ${destBankName}? Reply "confirm" or "cancel".`;

      return {
        success: true,
        data: {
          response: confirmMessage,
          timestamp: new Date().toISOString(),
          requiresConfirmation: true,
          pendingAction: {
            type: "transfer",
            amount: args.amount,
            recipientName: args.recipient_name,
            recipientAccount: args.recipient_account_number,
            recipientBank: destBankName,
            expiresIn: 300,
          },
        },
      };
    }

    // CANCEL (normal transfer / overdraft confirmation)
    if (normalized === "cancel" || normalized === "no" || normalized === "n") {
      await sessionRepo.updateSession(phoneNumber, {
        pendingTransaction: null,
      });

      logBankingOperation({
        userId,
        phoneNumber,
        action:
          pending.type === "overdraft_confirm"
            ? "overdraft_transfer_cancelled"
            : "transfer_cancelled",
        amount: pending.arguments?.amount,
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
      const overdraftConfirmed = pending.type === "overdraft_confirm";
      return await this.executeTransfer(
        pending,
        phoneNumber,
        ip,
        userId,
        overdraftConfirmed ? { overdraftConfirmed: true } : {},
      );
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
   * @param {Object} pending - pendingTransaction from session
   * @param {Object} [options] - { overdraftConfirmed: true } when user confirmed proceed despite low/negative balance
   * @private
   */
  async executeTransfer(pending, phoneNumber, ip, userId, options = {}) {
    const {
      recipient_account_number,
      recipient_bank_code,
      recipient_name,
      amount,
      from_account_id,
    } = pending.arguments;

    // Clear pending state immediately to prevent double execution
    await sessionRepo.updateSession(phoneNumber, { pendingTransaction: null });

    const bank = bankLookupService.getBankByCode(recipient_bank_code);
    const bankName = bank ? bank.name : recipient_bank_code;

    // 1. Get User & Account
    const user = await User.findById(userId);
    if (!user) return { success: true, data: { response: "User not found." } };

    let sourceAccount = null;
    if (from_account_id) {
      sourceAccount = await BankAccount.findOne({
        _id: from_account_id,
        userId,
        isActive: true,
      });
    } else {
      sourceAccount = await BankAccount.findOne({
        userId,
        isActive: true,
      });
    }

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

    // 3. Authorization (Mandate) Check — sync from Mono first for users who already approved
    if (
      !sourceAccount.mandateStatus ||
      sourceAccount.mandateStatus !== "active"
    ) {
      const synced = await this.syncMandateStatus(sourceAccount);
      if (synced) {
        sourceAccount = await BankAccount.findById(sourceAccount._id);
      }
    }
    if (
      !sourceAccount.mandateStatus ||
      sourceAccount.mandateStatus !== "active"
    ) {
      return await this.handleMissingMandate(sourceAccount, user, phoneNumber);
    }

    // 4. Verify Balance (skip if user already confirmed overdraft)
    const amountKobo = amount * 100;
    const mandateNotReady = (err) =>
      err && /not ready for use|try again in 5|wait.*minutes/i.test(String(err));

    if (!options.overdraftConfirmed) {
      let balanceCheck = await monoService.verifyMandateBalance(
        sourceAccount.mandateId,
        amountKobo,
      );

      if (!balanceCheck.success && balanceCheck.error) {
        const errMsg = balanceCheck.error;
        if (mandateNotReady(errMsg)) {
          const msg =
            "Your authorization just went through. The bank needs a few minutes before we can process the transfer. Please try again in about 5 minutes.";
          await conversationService.addAssistantMessage(phoneNumber, `⏳ ${msg}`);
          return { success: true, data: { response: `⏳ ${msg}` } };
        }
        if (/could not fetch|try again later|500/i.test(errMsg)) {
          // Fallback: use same linked-account balance API as "what's my balance" (balance in kobo)
          if (sourceAccount.monoAccountId) {
            const accountBalance = await monoService.getBalance(
              sourceAccount.monoAccountId,
            );
            if (accountBalance.success && accountBalance.balance != null) {
              const balanceKobo = Number(accountBalance.balance);
              const sufficient = balanceKobo >= amountKobo;
              const balanceNaira = balanceKobo / 100;
              if (!sufficient) {
                return await this.askOverdraftConfirmation(
                  phoneNumber,
                  {
                    recipient_account_number,
                    recipient_bank_code,
                    recipient_name,
                    amount,
                  },
                  balanceNaira,
                  bankName,
                  verifiedRecipientName,
                );
              }
              balanceCheck = { success: true, hasSufficientBalance: true };
            }
          }
          if (!balanceCheck.success) {
            const msg =
              "We couldn't check your balance via the transfer channel right now. Ask me \"what's my balance\" to see your balance; you can try the transfer again in a moment.";
            await conversationService.addAssistantMessage(phoneNumber, `⏳ ${msg}`);
            return { success: true, data: { response: `⏳ ${msg}` } };
          }
        } else {
          const msg = `Could not verify balance: ${errMsg}`;
          await conversationService.addAssistantMessage(phoneNumber, `⏳ ${msg}`);
          return { success: true, data: { response: `⏳ ${msg}` } };
        }
      }

      if (balanceCheck.hasSufficientBalance === false) {
        let balanceNaira = null;
        if (sourceAccount.monoAccountId) {
          const accountBalance = await monoService.getBalance(
            sourceAccount.monoAccountId,
          );
          if (accountBalance.success && accountBalance.balance != null) {
            balanceNaira = Number(accountBalance.balance) / 100;
          }
        }
        return await this.askOverdraftConfirmation(
          phoneNumber,
          {
            recipient_account_number,
            recipient_bank_code,
            recipient_name,
            amount,
          },
          balanceNaira,
          bankName,
          verifiedRecipientName,
        );
      }
    }

    // 5. Execute Debit (Mono requires beneficiary.nip_code to be 6+ chars)
    const nipCode = await monoService.getNipCodeForBankCode(recipient_bank_code);
    const debitReference = `trn${Date.now()}${userId.toString().slice(-4)}`;
    const debitResult = await monoService.debitMandate(
      sourceAccount.mandateId,
      amountKobo,
      debitReference,
      `Transfer to ${verifiedRecipientName}`,
      {
        accountNumber: recipient_account_number,
        bankCode: recipient_bank_code,
        nipCode: nipCode || String(recipient_bank_code).padStart(6, "0"),
      },
    );

    if (!debitResult.success) {
      const errMsg = debitResult.error || "Unknown error";
      let msg;
      if (mandateNotReady(errMsg)) {
        msg =
          "Your authorization just went through. The bank needs a few minutes before we can process the transfer. Please try again in about 5 minutes.";
      } else if (/beneficiary.*not enabled|contact support/i.test(errMsg)) {
        msg =
          "Transfers to other bank accounts are not enabled for this business yet. Please contact support or Mono to enable the beneficiary transfer feature.";
      } else {
        msg = `Transfer failed: ${errMsg}`;
      }
      const displayMsg = mandateNotReady(errMsg) ? `⏳ ${msg}` : `❌ ${msg}`;
      await conversationService.addAssistantMessage(phoneNumber, displayMsg);
      return { success: true, data: { response: displayMsg } };
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
   * Ask user to confirm proceeding when balance is low or negative (e.g. overdraft account).
   * Sets pendingTransaction type 'overdraft_confirm' so next "yes" runs the transfer with overdraftConfirmed.
   */
  async askOverdraftConfirmation(
    phoneNumber,
    args,
    balanceNaira,
    bankName,
    recipientDisplay,
  ) {
    const expiresAt = Date.now() + 5 * 60 * 1000;
    await sessionRepo.updateSession(phoneNumber, {
      pendingTransaction: {
        type: "overdraft_confirm",
        arguments: args,
        balanceNaira,
        expiresAt,
      },
    });

    const toName = recipientDisplay || args.recipient_name || `Account ${args.recipient_account_number}`;
    const balanceText =
      balanceNaira != null
        ? `Your current balance is ₦${Number(balanceNaira).toLocaleString("en-NG", { minimumFractionDigits: 2 })}. `
        : "Your balance may be below the transfer amount. ";
    const msg =
      `${balanceText}This might be an overdraft account. Do you still want to proceed with the transfer of ₦${Number(args.amount).toLocaleString()} to ${toName} at ${bankName}? Reply *Yes* to proceed or *No* to cancel.`;

    await conversationService.addAssistantMessage(phoneNumber, msg);
    return {
      success: true,
      data: {
        response: msg,
        timestamp: new Date().toISOString(),
        requiresConfirmation: true,
      },
    };
  }

  /**
   * Sync mandate status from Mono (for users who already approved before webhook was fixed).
   * @param {Object} sourceAccount - BankAccount document
   * @returns {Promise<boolean>} - true if account was updated with an active mandate
   */
  async syncMandateStatus(sourceAccount) {
    if (!sourceAccount.monoCustomerId) return false;
    const result = await monoService.listMandatesForCustomer(
      sourceAccount.monoCustomerId,
    );
    if (!result.success || !result.mandates?.length) return false;

    const approved = (m) =>
      m.status === "approved" || m.approved === true || m.ready_to_debit === true;
    const match = result.mandates.find((m) => {
      if (!approved(m)) return false;
      if (
        sourceAccount.mandateReference &&
        (m.reference === sourceAccount.mandateReference ||
          m.reference === sourceAccount.mandateReference?.trim())
      )
        return true;
      const accNum = m.account_number ?? m.accountNumber;
      if (
        sourceAccount.accountNumber &&
        accNum &&
        String(accNum).trim() === String(sourceAccount.accountNumber).trim()
      )
        return true;
      return false;
    });

    if (!match) return false;

    const mandateId = match.id ?? match.mandateId;
    if (!mandateId) return false;

    sourceAccount.mandateId = mandateId;
    sourceAccount.mandateStatus = "active";
    if (match.reference) sourceAccount.mandateReference = match.reference;
    await sourceAccount.save();
    console.log(
      `✅ Synced mandate from Mono for account ${sourceAccount._id}, mandateId: ${mandateId}`,
    );
    return true;
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
      const mandateUrl = mandateResult.payment_link || mandateResult.paymentLink;
      sourceAccount.mandateReference = mandateResult.reference;
      sourceAccount.mandateStatus = "pending";
      sourceAccount.mandateUrl = mandateUrl;
      await sourceAccount.save();

      const linkText = mandateUrl
        ? `👉 Please click here: ${mandateUrl}\n\n`
        : "👉 You will receive an authorization link shortly. Check your email or the app.\n\n";
      const authResponse =
        `🚨 *Authorization Required*\n\n` +
        `To securely process this transfer, you need to authorize Eureka with your bank once.\n\n` +
        linkText +
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

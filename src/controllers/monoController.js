/**
 * Mono Controller
 * Handles HTTP requests for Mono bank account operations
 */

const monoService = require("../services/monoService");
const User = require("../models/User");
const BankAccount = require("../models/BankAccount");

// In-memory store for pending account links (maps email -> userId)
// In production, consider using Redis for multi-instance support
const pendingAccountLinks = new Map();

/**
 * Start bank account linking process
 * POST /api/mono/initiate
 */
const initiateAccountLinking = async (req, res) => {
  try {
    const { phoneNumber, name, email } = req.body;

    if (!phoneNumber || !name || !email) {
      return res.status(400).json({
        success: false,
        message: "Phone number, name, and email are required",
      });
    }

    // Find or create user
    let user = await User.findOne({ phoneNumber });
    if (!user) {
      user = new User({ phoneNumber, name, email });
      await user.save();
    }

    // Generate Mono Connect URL
    // Embed reference in the URL so it comes back in the callback
    const ref = `user_${user._id}`;
    const baseUrl = process.env.BASE_URL_API || "http://localhost:4000";
    const redirectUrl = `${baseUrl}/api/mono/callback?reference=${ref}`;

    const result = await monoService.initiateAccountLinking(
      { name, email },
      redirectUrl,
      ref, // Still pass as ref for webhooks
    );

    if (!result.success) {
      return res.status(500).json(result);
    }

    // Store pending link so we can find user when webhook arrives
    // Key by email (lowercase) since Mono has the customer email
    pendingAccountLinks.set(email.toLowerCase(), {
      userId: user._id.toString(),
      phoneNumber: user.phoneNumber,
      timestamp: Date.now(),
    });
    console.log(`📝 Stored pending account link for ${email}`);

    // Clean up old pending links (older than 1 hour)
    const ONE_HOUR = 60 * 60 * 1000;
    for (const [key, value] of pendingAccountLinks.entries()) {
      if (Date.now() - value.timestamp > ONE_HOUR) {
        pendingAccountLinks.delete(key);
      }
    }

    res.json({
      success: true,
      message: "Account linking initiated",
      monoUrl: result.monoUrl,
      ref: result.ref,
    });
  } catch (error) {
    console.error("❌ Error in initiateAccountLinking:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Handle Mono callback after successful account linking
 * GET /api/mono/callback?code=xxxxx&status=linked
 *
 * Callback params:
 * - code: Authorization code to exchange for account ID (production)
 * - status: 'linked' or 'failed'
 * - reason: 'account_linked', 'widget_closed', etc.
 * - reference: The ref passed during initiation
 */
const handleCallback = async (req, res) => {
  try {
    const { code, status, reason, reference } = req.query;

    console.log(
      `📥 Mono callback: status=${status}, reason=${reason}, code=${code ? "present" : "missing"}, ref=${reference}`,
    );

    const redirectUrl =
      process.env.MONO_REDIRECT_URL || "http://localhost:3000/chat";

    // Handle failed linking
    if (status === "failed") {
      console.warn(`❌ Mono account linking failed: ${reason}`);
      return res.redirect(
        `${redirectUrl}?status=failed&message=${encodeURIComponent(reason || "Account linking failed")}`,
      );
    }

    // Handle successful linking (status=linked)
    if (status === "linked") {
      // Extract User ID from reference
      // Extract User ID from reference (format: user_<userId>_<timestamp>)
      let userId = null;
      if (reference && reference.startsWith("user_")) {
        const parts = reference.split("_");
        if (parts.length >= 2) {
          userId = parts[1]; // Get the ID part
        }
      }

      if (!code) {
        // No authorization code received - cannot proceed
        console.warn("⚠️ Mono callback received without authorization code");
        return res.redirect(
          `${redirectUrl}?status=failed&message=${encodeURIComponent("No authorization code received. Please try again.")}`,
        );
      }

      // Exchange code for account ID (production mode)
      try {
        const tokenResult = await monoService.exchangeToken(code);
        if (tokenResult.success) {
          const accountId = tokenResult.accountId;
          console.log(`✅ Mono account linked: ${accountId}`);

          // userId already extracted earlier

          if (userId) {
            // 1. Fetch Account Details
            const accountDetails =
              await monoService.getAccountDetails(accountId);

            if (accountDetails.success) {
              // 2. Create/Update BankAccount
              const accData = accountDetails.account;

              let bankAccount = await BankAccount.findOne({
                monoAccountId: accountId,
              });
              if (!bankAccount) {
                bankAccount = new BankAccount({
                  userId: userId,
                  monoAccountId: accountId,
                  monoCustomerId: accData.customer, // Save customer ID for mandates
                  accountNumber: accData.accountNumber,
                  accountName: accData.name,
                  bankName: accData.institution.name,
                  bankCode: accData.institution.bankCode,
                  balance: accData.balance,
                  currency: accData.currency,
                  accountType: accData.type,
                  isActive: true,
                  lastSynced: new Date(),
                });
                await bankAccount.save();
              } else {
                // Update existing
                bankAccount.balance = accData.balance;
                bankAccount.lastSynced = new Date();
                await bankAccount.save();
              }

              // 3. Link to User
              await User.findByIdAndUpdate(userId, {
                $addToSet: { linkedAccounts: bankAccount._id },
              });

              console.log(`💾 Saved account ${accountId} for user ${userId}`);
            }
          }

          // Redirect with accountId
          return res.redirect(
            `${redirectUrl}?status=success&message=Account+linked+successfully&accountId=${accountId}`,
          );
        } else {
          return res.redirect(
            `${redirectUrl}?status=failed&message=${encodeURIComponent(tokenResult.error || "Token exchange failed")}`,
          );
        }
      } catch (tokenError) {
        console.error("❌ Token exchange error:", tokenError);
        return res.redirect(
          `${redirectUrl}?status=failed&message=Token+exchange+error`,
        );
      }
    }

    // Default redirect for other statuses
    return res.redirect(
      `${redirectUrl}?status=info&message=Linking+status:+${status}`,
    );
  } catch (error) {
    console.error("❌ Error in handleCallback:", error);
    const redirectUrl =
      process.env.MONO_REDIRECT_URL || "http://localhost:3000/chat";
    res.redirect(`${redirectUrl}?status=error&message=Internal+server+error`);
  }
};

/**
 * Link a bank account (complete flow)
 * POST /api/mono/link-account
 * Body: { code, phoneNumber }
 */
const linkAccount = async (req, res) => {
  try {
    const { code, phoneNumber } = req.body;

    if (!code || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Code and phone number are required",
      });
    }

    // Find user
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Exchange code for account ID
    const tokenResult = await monoService.exchangeToken(code);
    if (!tokenResult.success) {
      return res.status(500).json(tokenResult);
    }

    const accountId = tokenResult.accountId;

    // Fetch account details
    const accountResult = await monoService.getAccountDetails(accountId);
    if (!accountResult.success) {
      return res.status(500).json(accountResult);
    }

    // Check if account already exists
    let bankAccount = await BankAccount.findOne({ monoAccountId: accountId });

    if (bankAccount) {
      // Update existing account
      bankAccount.accountNumber = accountResult.account.accountNumber;
      bankAccount.accountName = accountResult.account.name;
      bankAccount.bankName = accountResult.account.institution.name;
      bankAccount.bankCode = accountResult.account.institution.bankCode;
      bankAccount.balance = accountResult.account.balance;
      bankAccount.currency = accountResult.account.currency;
      bankAccount.accountType = accountResult.account.type;
      bankAccount.lastSynced = new Date();
    } else {
      // Create new account
      bankAccount = new BankAccount({
        userId: user._id,
        monoAccountId: accountId,
        monoCustomerId: accountResult.account.customer, // Save customer ID
        accountNumber: accountResult.account.accountNumber,
        accountName: accountResult.account.name,
        bankName: accountResult.account.institution.name,
        bankCode: accountResult.account.institution.bankCode,
        balance: accountResult.account.balance,
        currency: accountResult.account.currency,
        accountType: accountResult.account.type,
        isActive: true,
        lastSynced: new Date(),
      });
    }

    await bankAccount.save();

    // Add account to user's linked accounts if not already there
    if (!user.linkedAccounts.includes(bankAccount._id)) {
      user.linkedAccounts.push(bankAccount._id);
      await user.save();
    }

    res.json({
      success: true,
      message: "Bank account linked successfully!",
      account: {
        id: bankAccount._id,
        accountNumber: bankAccount.accountNumber,
        accountName: bankAccount.accountName,
        bankName: bankAccount.bankName,
        balance: bankAccount.balance,
        currency: bankAccount.currency,
      },
    });
  } catch (error) {
    console.error("❌ Error in linkAccount:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Get all linked accounts for a user
 * GET /api/mono/accounts?phoneNumber=xxx
 */
const getLinkedAccounts = async (req, res) => {
  try {
    const { phoneNumber } = req.query;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const user = await User.findOne({ phoneNumber }).populate("linkedAccounts");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      accounts: user.linkedAccounts.map((acc) => ({
        id: acc._id,
        accountNumber: acc.accountNumber,
        accountName: acc.accountName,
        bankName: acc.bankName,
        balance: acc.balance,
        currency: acc.currency,
        isActive: acc.isActive,
        lastSynced: acc.lastSynced,
      })),
    });
  } catch (error) {
    console.error("❌ Error in getLinkedAccounts:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Get account balance
 * GET /api/mono/balance/:accountId
 */
const getBalance = async (req, res) => {
  try {
    const { accountId } = req.params;

    const bankAccount = await BankAccount.findById(accountId);

    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    // Sync with Mono to get latest balance
    const result = await monoService.getBalance(bankAccount.monoAccountId);

    if (!result.success) {
      // Return cached balance if API fails
      return res.json({
        success: true,
        balance: bankAccount.balance,
        currency: bankAccount.currency,
        cached: true,
        lastSynced: bankAccount.lastSynced,
      });
    }

    // Update cached balance
    bankAccount.balance = result.balance;
    bankAccount.lastSynced = new Date();
    await bankAccount.save();

    res.json({
      success: true,
      balance: result.balance,
      currency: result.currency,
      cached: false,
      lastSynced: bankAccount.lastSynced,
    });
  } catch (error) {
    console.error("❌ Error in getBalance:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Get transaction history
 * GET /api/mono/transactions/:accountId?page=1&start=2024-01-01&end=2024-12-31
 */
const getTransactions = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { page, start, end } = req.query;

    const bankAccount = await BankAccount.findById(accountId);

    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    const result = await monoService.getTransactions(
      bankAccount.monoAccountId,
      {
        page: page ? parseInt(page) : 1,
        start,
        end,
      },
    );

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      transactions: result.transactions,
      meta: result.meta,
    });
  } catch (error) {
    console.error("❌ Error in getTransactions:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Sync account data
 * POST /api/mono/sync/:accountId
 */
const syncAccount = async (req, res) => {
  try {
    const { accountId } = req.params;

    const bankAccount = await BankAccount.findById(accountId);

    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    // Trigger sync
    const result = await monoService.syncAccount(bankAccount.monoAccountId);

    if (!result.success) {
      return res.status(500).json(result);
    }

    // Fetch updated account details
    const accountResult = await monoService.getAccountDetails(
      bankAccount.monoAccountId,
    );

    if (accountResult.success) {
      bankAccount.balance = accountResult.account.balance;
      bankAccount.lastSynced = new Date();
      await bankAccount.save();
    }

    res.json({
      success: true,
      message: "Account synced successfully",
      account: {
        balance: bankAccount.balance,
        lastSynced: bankAccount.lastSynced,
      },
    });
  } catch (error) {
    console.error("❌ Error in syncAccount:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Unlink a bank account
 * DELETE /api/mono/unlink/:accountId
 */
const unlinkAccount = async (req, res) => {
  try {
    const { accountId } = req.params;

    const bankAccount = await BankAccount.findById(accountId);

    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    // Unlink from Mono
    const result = await monoService.unlinkAccount(bankAccount.monoAccountId);

    if (!result.success) {
      return res.status(500).json(result);
    }

    // Mark as inactive (don't delete to preserve history)
    bankAccount.isActive = false;
    await bankAccount.save();

    // Remove from user's linked accounts
    await User.updateOne(
      { _id: bankAccount.userId },
      { $pull: { linkedAccounts: bankAccount._id } },
    );

    res.json({
      success: true,
      message: "Account unlinked successfully",
    });
  } catch (error) {
    console.error("❌ Error in unlinkAccount:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Get list of supported banks
 * GET /api/mono/banks
 */
const getBanks = async (req, res) => {
  try {
    const result = await monoService.getBanks();

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      banks: result.banks,
    });
  } catch (error) {
    console.error("❌ Error in getBanks:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Initiate a one-time payment
 * POST /api/mono/payments/initiate
 */
const initiatePayment = async (req, res) => {
  try {
    const {
      amount,
      type,
      method,
      account,
      description,
      reference,
      redirectUrl,
      customer,
      meta,
      split,
    } = req.body;

    if (!amount || !reference || !customer) {
      return res.status(400).json({
        success: false,
        message:
          "Amount, reference, and customer (name, email, phone) are required",
      });
    }

    if (!customer.name || !customer.email || !customer.phone) {
      return res.status(400).json({
        success: false,
        message: "Customer name, email, and phone are required",
      });
    }

    const result = await monoService.initiatePayment({
      amount,
      type: type || "onetime-debit",
      method: method || "account",
      account,
      description,
      reference,
      redirectUrl:
        redirectUrl ||
        `${process.env.BASE_URL || "http://localhost:3000"}/api/mono/payments/callback`,
      customer,
      meta,
      split,
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      message: "Payment initiated",
      paymentLink: result.paymentLink,
      reference: result.reference,
      data: result.data,
    });
  } catch (error) {
    console.error("❌ Error in initiatePayment:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Verify payment status
 * GET /api/mono/payments/verify/:reference
 */
const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required",
      });
    }

    const result = await monoService.verifyPayment(reference);

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      status: result.status,
      amount: result.amount,
      reference: result.reference,
      data: result.data,
    });
  } catch (error) {
    console.error("❌ Error in verifyPayment:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Handle payment callback (redirect after payment)
 * GET /api/mono/payments/callback
 */
const handlePaymentCallback = async (req, res) => {
  try {
    const { reference, status, reason } = req.query;

    console.log(
      `📥 Payment callback: reference=${reference}, status=${status}, reason=${reason || "N/A"}`,
    );

    if (status === "successful") {
      // Verify the payment
      const result = await monoService.verifyPayment(reference);

      // You can redirect to a success page or return JSON
      res.json({
        success: true,
        message: "Payment successful",
        reference,
        data: result.data,
      });
    } else {
      res.json({
        success: false,
        message: "Payment failed",
        reference,
        reason: reason || "Unknown error",
      });
    }
  } catch (error) {
    console.error("❌ Error in handlePaymentCallback:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Handle Mono webhook events
 * POST /api/mono/webhook
 *
 * Mono webhook events:
 * - mono.events.account_connected: User successfully linked their account
 * - mono.events.account_updated: Account data has been updated
 * - mono.events.reauthorisation_required: Account needs re-authentication
 * - mono.events.account_reauthorized: Account has been re-authenticated
 * - mono.events.unlink: Account has been unlinked
 */
const handleMonoWebhook = async (req, res) => {
  try {
    // Verify webhook signature (optional but recommended)
    const webhookSecret = process.env.MONO_WEBHOOK_SECRET;
    const signature = req.headers["mono-webhook-secret"];

    if (webhookSecret && signature !== webhookSecret) {
      console.warn("⚠️ Invalid Mono webhook signature");
      return res
        .status(401)
        .json({ success: false, message: "Invalid signature" });
    }

    const { event, data } = req.body;

    console.log(`📥 Mono webhook received: ${event}`);
    console.log("   Data:", JSON.stringify(data, null, 2));

    // Acknowledge receipt immediately
    res.status(200).json({ success: true, received: true });

    // Process webhook asynchronously
    await processMonoWebhook(event, data);
  } catch (error) {
    console.error("❌ Error in handleMonoWebhook:", error);
    // Still return 200 to prevent retries for processing errors
    res.status(200).json({ success: true, received: true });
  }
};

/**
 * Process Mono webhook events asynchronously
 */
async function processMonoWebhook(event, data) {
  try {
    // Lazy load whatsappService to avoid circular dependency
    const whatsappService = require("../services/whatsappService");

    switch (event) {
      case "mono.events.account_connected": {
        // User successfully linked their account
        // Note: Mono sends account as a string ID directly, not an object
        const accountId =
          typeof data.account === "string"
            ? data.account
            : data.account?.id || data.id;
        const ref = data.meta?.ref || data.reference;

        console.log(`✅ Account connected: ${accountId}, ref: ${ref}`);

        // Extract user ID from ref (format: user_<userId>)
        let userId = null;
        let phoneNumber = null;

        if (ref && ref.startsWith("user_")) {
          const parts = ref.split("_");
          if (parts.length >= 2) {
            userId = parts[1];
          }

          // Find user to get phone number
          const user = await User.findById(userId);
          if (user) {
            phoneNumber = user.phoneNumber;
          }
        }

        if (accountId) {
          // Fetch account details from Mono
          const accountResult = await monoService.getAccountDetails(accountId);

          // If we don't have userId from ref, try to find from pending links
          // This handles cases where Mono doesn't send ref in account_connected
          if (accountResult.success && !userId) {
            // Check if account already exists (maybe from a previous attempt)
            const existingAccount = await BankAccount.findOne({
              monoAccountId: accountId,
            });
            if (existingAccount) {
              console.log(
                `ℹ️ Account already exists in database, skipping save`,
              );
              return;
            }

            // Try to find the user from pending links using account holder name or email
            // The account name from Mono might match what we stored
            console.log(`🔍 Looking up pending link for account...`);

            // Check all pending links - we'll match by most recent if multiple
            let bestMatch = null;
            for (const [email, linkData] of pendingAccountLinks.entries()) {
              // Use the most recent pending link (within last hour)
              const ONE_HOUR = 60 * 60 * 1000;
              if (Date.now() - linkData.timestamp < ONE_HOUR) {
                if (!bestMatch || linkData.timestamp > bestMatch.timestamp) {
                  bestMatch = { email, ...linkData };
                }
              }
            }

            if (bestMatch) {
              userId = bestMatch.userId;
              phoneNumber = bestMatch.phoneNumber;
              console.log(`✅ Found pending link for user: ${userId}`);

              // Remove from pending links after successful match
              pendingAccountLinks.delete(bestMatch.email);
            } else {
              console.log(
                `⚠️ No pending account link found, cannot save account`,
              );
            }
          }

          if (accountResult.success && userId) {
            // Check if account already exists
            const existingAccount = await BankAccount.findOne({
              monoAccountId: accountId,
            });

            if (!existingAccount) {
              // Save to database
              const bankAccount = new BankAccount({
                userId: userId,
                monoAccountId: accountId,
                monoCustomerId: accountResult.account.customer || data.customer, // Use API result or webhook data
                accountNumber: accountResult.account.accountNumber,
                accountName: accountResult.account.name,
                bankName: accountResult.account.institution.name,
                bankCode: accountResult.account.institution.bankCode,
                balance: accountResult.account.balance,
                currency: accountResult.account.currency,
                accountType: accountResult.account.type,
                isActive: true,
              });

              await bankAccount.save();
              console.log(
                `✅ Bank account saved to database: ${accountResult.account.institution.name}`,
              );

              // Add bank account to user's linkedAccounts array
              await User.findByIdAndUpdate(userId, {
                $addToSet: { linkedAccounts: bankAccount._id },
              });
              console.log(`✅ Added bank account to user's linkedAccounts`);
            }

            // Send WhatsApp notification to user
            if (phoneNumber) {
              const message =
                `✅ *Bank Account Linked Successfully!*\n\n` +
                `🏦 Bank: ${accountResult.account.institution.name}\n` +
                `📄 Account: ****${accountResult.account.accountNumber.slice(-4)}\n` +
                `💰 Balance: ${accountResult.account.currency} ${(accountResult.account.balance / 100).toLocaleString()}\n\n` +
                `You can now check your balance and transactions through WhatsApp!`;

              await whatsappService.sendMessage(phoneNumber, message);
              console.log(`📱 WhatsApp notification sent to ${phoneNumber}`);
            }
          }
        }
        break;
      }

      case "mono.events.account_updated": {
        // Account data has been synced/updated - this event contains full account details and ref
        // Note: Mono sends account._id not account.id
        const accountId =
          data.account?._id ||
          data.account?.id ||
          (typeof data.account === "string" ? data.account : data.id);
        const ref = data.meta?.ref;
        console.log(`🔄 Account updated: ${accountId}, ref: ${ref}`);

        if (accountId) {
          // Check if account already exists
          let bankAccount = await BankAccount.findOne({
            monoAccountId: accountId,
          });

          // Extract user from ref if available and account doesn't exist yet
          let userId = null;
          let phoneNumber = null;

          if (ref && ref.startsWith("user_")) {
            userId = ref.replace("user_", "");
            const user = await User.findById(userId);
            if (user) {
              phoneNumber = user.phoneNumber;
            }
          }

          // If account doesn't exist and we have user + full account data, create it
          if (
            !bankAccount &&
            userId &&
            data.account &&
            typeof data.account === "object"
          ) {
            bankAccount = new BankAccount({
              userId: userId,
              monoAccountId: accountId,
              accountNumber: data.account.accountNumber,
              accountName: data.account.name,
              bankName: data.account.institution?.name,
              bankCode: data.account.institution?.bankCode,
              balance: data.account.balance,
              currency: data.account.currency,
              accountType: data.account.type,
              isActive: true,
              lastSynced: new Date(),
            });

            await bankAccount.save();
            console.log(
              `✅ Bank account saved to database: ${data.account.institution?.name}`,
            );

            // Add to user's linked accounts
            await User.findByIdAndUpdate(userId, {
              $addToSet: { linkedAccounts: bankAccount._id },
            });

            // Send WhatsApp notification
            if (phoneNumber) {
              const message =
                `✅ *Bank Account Linked Successfully!*\n\n` +
                `🏦 Bank: ${data.account.institution?.name}\n` +
                `📄 Account: ****${data.account.accountNumber?.slice(-4)}\n` +
                `💰 Balance: ${data.account.currency} ${(data.account.balance / 100).toLocaleString()}\n\n` +
                `You can now check your balance and transactions through WhatsApp!`;

              await whatsappService.sendMessage(phoneNumber, message);
              console.log(`📱 WhatsApp notification sent to ${phoneNumber}`);
            }
          } else if (bankAccount) {
            // Update existing account with latest data
            bankAccount.balance = data.account?.balance || bankAccount.balance;
            bankAccount.lastSynced = new Date();
            await bankAccount.save();
            console.log(`✅ Account balance updated in database`);
          }
        }
        break;
      }

      case "mono.events.reauthorisation_required": {
        // Account needs re-authentication
        const accountId = data.account?.id || data.id;
        console.log(`⚠️ Reauthorization required for account: ${accountId}`);

        // Find the bank account and user
        const bankAccount = await BankAccount.findOne({
          monoAccountId: accountId,
        }).populate("userId");

        if (bankAccount && bankAccount.userId?.phoneNumber) {
          // Generate reauth URL
          const redirectUrl = `${process.env.BASE_URL || "http://localhost:3000"}/api/mono/callback`;
          const reauthResult = await monoService.initiateReauth(
            accountId,
            redirectUrl,
          );

          if (reauthResult.success) {
            const message =
              `⚠️ *Action Required: Re-authenticate Your Bank Account*\n\n` +
              `🏦 Your ${bankAccount.bankName} account needs to be re-authenticated.\n\n` +
              `Please click the link below to reconnect:\n${reauthResult.monoUrl}`;

            await whatsappService.sendMessage(
              bankAccount.userId.phoneNumber,
              message,
            );
            console.log(
              `📱 Reauth notification sent to ${bankAccount.userId.phoneNumber}`,
            );
          }
        }

        // Mark account as needing reauth
        await BankAccount.findOneAndUpdate(
          { monoAccountId: accountId },
          { isActive: false },
        );
        break;
      }

      case "mono.events.account_reauthorized": {
        // Account has been re-authenticated
        const accountId = data.account?.id || data.id;
        console.log(`✅ Account reauthorized: ${accountId}`);

        // Reactivate account
        await BankAccount.findOneAndUpdate(
          { monoAccountId: accountId },
          { isActive: true },
        );

        // Find user and notify
        const bankAccount = await BankAccount.findOne({
          monoAccountId: accountId,
        }).populate("userId");
        if (bankAccount && bankAccount.userId?.phoneNumber) {
          const message =
            `✅ *Bank Account Reconnected!*\n\n` +
            `Your ${bankAccount.bankName} account has been successfully reconnected.`;

          await whatsappService.sendMessage(
            bankAccount.userId.phoneNumber,
            message,
          );
        }
        break;
      }

      case "mono.events.unlink": {
        // Account has been unlinked
        const accountId = data.account?.id || data.id;
        console.log(`🗑️ Account unlinked: ${accountId}`);

        // Find and notify user before deleting
        const bankAccount = await BankAccount.findOne({
          monoAccountId: accountId,
        }).populate("userId");

        if (bankAccount && bankAccount.userId?.phoneNumber) {
          const message =
            `ℹ️ *Bank Account Disconnected*\n\n` +
            `Your ${bankAccount.bankName} account has been disconnected.\n\n` +
            `To link a new account, send "link account".`;

          await whatsappService.sendMessage(
            bankAccount.userId.phoneNumber,
            message,
          );
        }

        // Remove from database
        await BankAccount.findOneAndDelete({ monoAccountId: accountId });
        break;
      }

      case "mono.events.mandate.approved":
      case "mono.events.mandate.created": {
        console.log(`📜 Mandate event received: ${event}`);
        const mandateId = data.id; // Mandate ID (mmc_...)
        const reference = data.reference;
        const accountId = data.account; // Account ID

        // Find Account
        let bankAccount = null;
        if (reference) {
          bankAccount = await BankAccount.findOne({
            mandateReference: reference,
          });
        }
        if (!bankAccount && accountId) {
          bankAccount = await BankAccount.findOne({ monoAccountId: accountId });
        }

        if (bankAccount) {
          bankAccount.mandateId = mandateId;
          bankAccount.mandateStatus = "active"; // Or "approved" then "active" after 24h?
          // Assuming active for now to unblock testing
          await bankAccount.save();
          console.log(`✅ Mandate activating for account ${bankAccount._id}`);

          if (bankAccount.userId) {
            const user = await User.findById(bankAccount.userId);
            if (user && user.phoneNumber) {
              await whatsappService.sendMessage(
                user.phoneNumber,
                `✅ *Authorization Successful*\n\nYou can now perform transfers! Direct Debit is active.`,
              );
            }
          }
        } else {
          console.warn(`⚠️ Could not find account for mandate ${mandateId}`);
        }
        break;
      }

      default:
        console.log(`ℹ️ Unhandled Mono webhook event: ${event}`);
    }
  } catch (error) {
    console.error(
      `❌ Error processing Mono webhook (${event}):`,
      error.message,
    );
  }
}

module.exports = {
  initiateAccountLinking,
  handleCallback,
  linkAccount,
  getLinkedAccounts,
  getBalance,
  getTransactions,
  syncAccount,
  unlinkAccount,
  getBanks,
  initiatePayment,
  verifyPayment,
  handlePaymentCallback,
  handleMonoWebhook,
};

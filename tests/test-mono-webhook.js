const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const BankAccount = require("../src/models/BankAccount");
const User = require("../src/models/User");

// Mock Mono Webhook Payload with DIGITAL_SAVINGS_ACCOUNT
const webhookPayload = {
  event: "mono.events.account_connected",
  data: {
    meta: {
      data_status: "AVAILABLE",
      auth_method: "mobile_banking",
    },
    account: {
      _id: "661448b598d287413669143f",
      institution: {
        name: "Kuda Bank",
        bankCode: "090267",
        type: "PERSONAL_BANKING",
      },
      name: "Test User",
      accountNumber: "2010980893",
      type: "DIGITAL_SAVINGS_ACCOUNT", // This caused the error
      balance: 500000,
      currency: "NGN",
      bvn: "22222222222",
    },
  },
};

async function runTest() {
  let mongoServer;
  try {
    console.log("🚀 Starting Mono Webhook Simulation...");

    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Create dummy user
    const user = await User.create({
      phoneNumber: "1234567890",
      pushName: "Test User",
    });

    // Simulate saving account from webhook data
    const accountData = webhookPayload.data.account;

    const bankAccount = new BankAccount({
      userId: user._id,
      monoAccountId: accountData._id,
      accountNumber: accountData.accountNumber,
      accountName: accountData.name,
      bankName: accountData.institution.name,
      bankCode: accountData.institution.bankCode,
      balance: accountData.balance,
      currency: accountData.currency,
      accountType: accountData.type, // Should now be valid
      isActive: true,
      lastSynced: new Date(),
    });

    await bankAccount.save();
    console.log(
      "✅ BankAccount saved successfully with type:",
      bankAccount.accountType,
    );

    // Verify it was saved
    const saved = await BankAccount.findOne({ monoAccountId: accountData._id });
    if (saved && saved.accountType === "DIGITAL_SAVINGS_ACCOUNT") {
      console.log(
        "🎉 Verification PASSED: 'DIGITAL_SAVINGS_ACCOUNT' is accepted",
      );
    } else {
      console.error("❌ Verification FAILED: Account not saved correctly");
    }
  } catch (error) {
    console.error("❌ Test Failed:", error.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  }
}

runTest();

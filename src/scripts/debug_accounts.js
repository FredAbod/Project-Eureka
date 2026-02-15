const mongoose = require("mongoose");
const User = require("../models/User");
const BankAccount = require("../models/BankAccount");
require("dotenv").config();

async function debugAccounts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to DB");

    // const phoneNumber = "2349070521702"; // User's phone
    let user = null;

    const users = await User.find().limit(5);
    console.log("Found users:", users.length);
    users.forEach((u) =>
      console.log(`${u.name} | ${u.phoneNumber} | ${u._id}`),
    );

    if (users.length > 0) {
      user = await User.findById(users[0]._id).populate("linkedAccounts");
      // ... rest of logic using this user
    }

    if (!user) {
      console.log("User not found");
      return;
    }

    console.log(`User: ${user.name} (${user._id})`);
    console.log("Linked Accounts in User Model:", user.linkedAccounts.length);
    user.linkedAccounts.forEach((acc) => {
      console.log(` - ${acc.bankName} (${acc.accountNumber}): ${acc._id}`);
    });

    console.log("\n--- All BankAccounts with this userId ---");
    const allAccounts = await BankAccount.find({ userId: user._id });
    allAccounts.forEach((acc) => {
      console.log(
        ` - ${acc.bankName} (${acc.accountNumber}): ${acc._id} [Active: ${acc.isActive}]`,
      );
    });
  } catch (error) {
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
}

debugAccounts();

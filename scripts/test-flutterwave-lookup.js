require("dotenv").config();
const bankLookupService = require("../src/services/bankLookupService");

async function testFlutterwaveLookup() {
  console.log("--- Flutterwave Lookup Test ---");
  const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
  console.log(
    "FLUTTERWAVE_SECRET_KEY:",
    secretKey ? `Set (Length: ${secretKey.length})` : "Missing",
  );

  if (secretKey && !secretKey.startsWith("FLWSECK")) {
    console.warn(
      '⚠️  WARNING: The Secret Key does not start with "FLWSECK". Flutterwave V3 keys usually start with "FLWSECK-" or "FLWSECK_TEST-". You might have copied the wrong key.',
    );
  }

  // Test data from user
  const accountNumber = "3148199894";
  const bankName = "First Bank of Nigeria";

  console.log(`\nLooking up ${accountNumber} at ${bankName}...`);

  try {
    const result = await bankLookupService.lookupAccount(
      accountNumber,
      bankName,
    );
    console.log("Result:", JSON.stringify(result, null, 2));

    if (result.success && result.source === "flutterwave") {
      console.log("\n✅ Verification Successful via Flutterwave!");
      console.log(`Account Name: ${result.accountName}`);
    } else if (result.success) {
      console.log("\n✅ Verification Successful (via Mono)!");
      console.log(`Account Name: ${result.accountName}`);
    } else {
      console.log("\n❌ Verification Failed.");
      console.log(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

testFlutterwaveLookup();

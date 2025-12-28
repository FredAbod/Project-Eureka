const sessionRepo = require("../src/repositories/sessionRepository");
const userRepo = require("../src/repositories/userRepository");
const whatsappService = require("../src/services/whatsappService");

// Mock Repositories to prevent DB connection hang
sessionRepo.getOrCreate = async (from) => ({
  from,
  userId: "user-123",
  pendingTransaction: null,
});
sessionRepo.updateSession = async () => {};

userRepo.getUserByPhone = async () => ({
  name: "Test User",
  connectionState: null,
});

// Mock sendMessage to avoid actual API calls
whatsappService.sendMessage = async (to, text) => {
  console.log(`\nMOCKED sendMessage call:`);
  console.log(`To: ${to}`);
  console.log(`Text: ${text}`);
  return { success: true, messageId: "mock-id" };
};

// Sample Webhook Payload
const samplePayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "123456789",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "1234567890",
              phone_number_id: "1234567890",
            },
            contacts: [
              { profile: { name: "Test User" }, wa_id: "2348000000000" },
            ],
            messages: [
              {
                from: "2348000000000",
                id: "wamid.HBgLM...",
                timestamp: "1700000000",
                text: { body: "hi" },
                type: "text",
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

async function runTest() {
  console.log("Starting Webhook Flow Simulation (with Mocks)...");
  try {
    const result = await whatsappService.processWebhook(samplePayload);
    console.log("\nProcess Result:", result);
  } catch (error) {
    console.error("Test Failed:", error);
  }
}

runTest();

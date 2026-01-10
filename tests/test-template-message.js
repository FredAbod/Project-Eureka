/**
 * Test script to send a TEMPLATE message from your bot
 *
 * WhatsApp Cloud API requires template messages for business-initiated conversations.
 * After the user replies, you get a 24-hour window to send free-form messages.
 *
 * Usage:
 *   node tests/test-template-message.js +2349070521702
 */

require("dotenv").config();

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error("❌ Please provide a phone number as argument");
  console.error("Usage: node tests/test-template-message.js +2349070521702");
  process.exit(1);
}

// Remove any non-numeric characters
const cleanNumber = phoneNumber.replace(/[^0-9]/g, "");

console.log("📱 Sending TEMPLATE message to:", cleanNumber);
console.log("🔗 Using API URL:", process.env.WHATSAPP_API_URL);

async function sendTemplateMessage() {
  try {
    const response = await fetch(process.env.WHATSAPP_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cleanNumber,
        type: "template",
        template: {
          name: "hello_world", // This is a pre-approved template from Meta
          language: {
            code: "en_US",
          },
        },
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Template message sent successfully!");
      console.log("📨 Message ID:", data.messages?.[0]?.id);
      console.log(
        "\n📲 Check your phone! You should receive the hello_world template."
      );
      console.log(
        "💡 Reply to that message to open a 24-hour messaging window."
      );
    } else {
      console.error("❌ Error:", data.error?.message || JSON.stringify(data));
      console.error("Full response:", JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("❌ Request failed:", error.message);
  }
}

sendTemplateMessage();

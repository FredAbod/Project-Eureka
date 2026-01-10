/**
 * Test script to send a message from your bot to a real phone number
 *
 * Usage:
 *   node tests/test-send-message.js +2348012345678
 *
 * Replace with your actual WhatsApp number
 */

require("dotenv").config();

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error("❌ Please provide a phone number as argument");
  console.error("Usage: node tests/test-send-message.js +2348012345678");
  process.exit(1);
}

// Remove any non-numeric characters except leading +
const cleanNumber = phoneNumber.replace(/[^0-9]/g, "");

console.log("📱 Sending test message to:", cleanNumber);
console.log("🔗 Using API URL:", process.env.WHATSAPP_API_URL);

async function sendTestMessage() {
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
        type: "text",
        text: {
          body: "👋 Hello! This is a test message from Eureka bot. If you received this, your bot is working!",
        },
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Message sent successfully!");
      console.log("📨 Message ID:", data.messages?.[0]?.id);
    } else {
      console.error("❌ Error:", data.error?.message || JSON.stringify(data));
      console.error("Full response:", JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("❌ Request failed:", error.message);
  }
}

sendTestMessage();

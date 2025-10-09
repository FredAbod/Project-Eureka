const validator = require('validator');

// Validate phone number format
function isValidPhoneNumber(phone) {
  return typeof phone === 'string' && /^\+[1-9]\d{6,14}$/.test(phone);
}

// Validate message content
function isValidMessage(text) {
  return typeof text === 'string' && text.length > 0 && text.length <= 4096;
}

async function sendMessage(to, text, retries = 2) {
  try {
    // Test mode - skip actual API calls in development
    if (process.env.NODE_ENV === 'development' && process.env.WHATSAPP_TEST_MODE !== 'false') {
      console.log(`[whatsappAdapter] TEST MODE - simulated send to ${to}: ${text}`);
      return { simulated: true, to, message: text };
    }

    // Input validation
    if (!isValidPhoneNumber(to)) {
      throw new Error('invalid_phone_number');
    }
    
    if (!isValidMessage(text)) {
      throw new Error('invalid_message_content');
    }

    // Ensure we have a fetch implementation. Prefer global fetch (Node 18+).
    let _fetch = globalThis.fetch;
    if (!_fetch) {
      const mod = await import('node-fetch');
      _fetch = mod.default || mod;
    }
    
    const apiUrl = process.env.WHATSAPP_API_URL;
    const token = process.env.WHATSAPP_API_TOKEN;

    if (!apiUrl || !token) {
      console.log(`[whatsappAdapter] simulated send to ${to}: ${validator.escape(text.substring(0, 100))}`);
      return { simulated: true, to, messageLength: text.length };
    }

    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const res = await _fetch(apiUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'WhatsApp-Banking-Bot/1.0'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      const j = await res.json();
      
      if (!res.ok) {
        console.error('[whatsappAdapter] send failed', {
          status: res.status,
          statusText: res.statusText,
          error: j,
          to: to.substring(0, 8) + '***' // partial phone for logging
        });
        
        // Retry on recoverable errors
        if (retries > 0 && (res.status >= 500 || res.status === 429)) {
          console.info(`[whatsappAdapter] retrying send (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (3 - retries))); // exponential backoff
          return sendMessage(to, text, retries - 1);
        }
        
        throw new Error(`whatsapp_api_error_${res.status}`);
      }
      
      console.info('[whatsappAdapter] message sent successfully', {
        to: to.substring(0, 8) + '***',
        messageId: j.messages?.[0]?.id,
        messageLength: text.length
      });
      
      return j;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        throw new Error('whatsapp_send_timeout');
      }
      throw fetchError;
    }
  } catch (err) {
    console.error('[whatsappAdapter] send error:', {
      error: err.message,
      to: to?.substring(0, 8) + '***',
      retries
    });
    throw err;
  }
}

module.exports = { sendMessage };

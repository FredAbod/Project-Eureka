/**
 * AI Response Parser
 * Handles recovering structured data from raw/hallucinated AI responses
 */
class AIParser {
  /**
   * Parse the AI response to determine if it's a tool call or text
   * @param {Object} choice - The Groq API choice object
   * @returns {Object} { type: 'function_call' | 'text', ... }
   */
  parse(choice) {
    const message = choice.message;

    // 1. Standard Tool Call check
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      try {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        return {
          type: "function_call",
          function: functionName,
          arguments: args,
          rawResponse: message,
        };
      } catch (e) {
        console.warn("⚠️ Failed to parse valid tool call JSON:", e.message);
        // Fall through to text/fallback
      }
    }

    // 2. Fallback: Check for raw tags in content
    const content = message.content || "";
    const fallback = this.tryParseHallucination(content, message);
    if (fallback) {
      return fallback;
    }

    // 3. Regular Text
    return {
      type: "text",
      content: this.sanitizeContent(content),
      rawResponse: message,
    };
  }

  /**
   * Attempt to recover tool calls from raw text (hallucinations)
   * @param {string} content
   * @param {Object} rawResponse
   */
  tryParseHallucination(content, rawResponse = {}) {
    if (!content) return null;

    const pythonTagMatch = content.match(/<\|python_tag\|>([\w_]+)\((.*?)\)/s);
    const xmlJsonMatch = content.match(
      /<function=([\w_]+)({.*?})<\/function>/s,
    ); // <function=name{json}>
    // Sometimes it's <function=name>{json}</function>
    const xmlJsonMatch2 = content.match(
      /<function=([\w_]+)>({.*?})<\/function>/s,
    );

    const tagMatch = pythonTagMatch || xmlJsonMatch || xmlJsonMatch2;

    if (!tagMatch) return null;

    const functionName = tagMatch[1];
    const argsRaw = tagMatch[2];

    console.warn("⚠️ Detected raw tool call tag:", { functionName, argsRaw });

    // Helper: clean positional args
    const parsePositional = (raw) =>
      raw.split(",").map((arg) => arg.trim().replace(/^["']|["']$/g, ""));

    let parsedArgs = {};

    // JSON Handling
    if (xmlJsonMatch || xmlJsonMatch2) {
      try {
        parsedArgs = JSON.parse(argsRaw);
        console.log("✅ Recovered JSON tool call from raw tag");
        return {
          type: "function_call",
          function: functionName,
          arguments: parsedArgs,
          rawResponse: rawResponse,
          hallucinated: true,
        };
      } catch (e) {
        console.warn("Failed to parse JSON in raw tag:", e.message);
      }
    }

    // Positional or Named Argument Handling (Python tag)
    if (pythonTagMatch) {
      // Check for named arguments pattern (key=value)
      if (argsRaw.includes("=")) {
        const namedArgs = {};
        argsRaw.split(",").forEach((pair) => {
          const [key, val] = pair.split("=");
          if (key && val) {
            namedArgs[key.trim()] = val.trim().replace(/^["']|["']$/g, "");
          }
        });

        // Smart Recovery for known functions
        if (["transfer_money", "lookup_recipient"].includes(functionName)) {
          console.log(`✅ Recovered named-arg tool call: ${functionName}`);
          return {
            type: "function_call",
            function: functionName,
            arguments: namedArgs,
            rawResponse,
            hallucinated: true,
          };
        }
      }

      // Fallback to positional parsing
      const argsList = parsePositional(argsRaw);

      if (functionName === "lookup_recipient" && argsList.length >= 2) {
        return {
          type: "function_call",
          function: functionName,
          arguments: {
            account_number: argsList[0],
            bank_name: argsList[1],
          },
          rawResponse,
          hallucinated: true,
        };
      }
    }

    return null;
  }

  /**
   * Remove raw tags from content to prevent leaking to user
   */
  sanitizeContent(content) {
    if (!content) return "";
    let clean = content
      .replace(/<\|python_tag\|>[\s\S]*?(\)|$)/gi, "") // Global, Case-insensitive, Multiline
      .replace(/<function=[\s\S]*?>[\s\S]*?<\/function>/gi, "")
      .replace(/<function=[\s\S]*?>/gi, "")
      .trim();

    if (!clean && content.includes("python_tag")) {
      return "I encountered a technical glitch. Could you rephrase your request?";
    }
    return clean;
  }
}

module.exports = new AIParser();

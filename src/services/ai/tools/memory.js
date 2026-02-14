const memoryTools = [
  {
    type: "function",
    function: {
      name: "learn_rule",
      description:
        "Save a new fact, rule, or preference to your long-term memory. Use this when the user explicitly teaches you something or corrects you.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description:
              "The keyword, phrase, or topic to remember (e.g., 'kudi', 'office_hours', 'my_nickname').",
          },
          value: {
            type: "string",
            description:
              "The definition, rule, or fact to associate with the key.",
          },
          category: {
            type: "string",
            enum: ["correction", "preference", "fact"],
            description: "The type of information being learned.",
          },
        },
        required: ["key", "value"],
      },
    },
  },
];

module.exports = memoryTools;

import { BaseTool } from "./base-tool.js";

export interface AskUserOption {
  label: string;
  description: string;
}

export interface AskUserRequest {
  question: string;
  options: AskUserOption[];
}

export type AskUserHandler = (request: AskUserRequest) => Promise<string>;

function parseOptions(value: unknown): AskUserOption[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  if (value.length < 2 || value.length > 4) {
    return null;
  }

  const options: AskUserOption[] = [];
  for (const option of value) {
    if (!option || typeof option !== "object") {
      return null;
    }

    const label = (option as { label?: unknown }).label;
    const description = (option as { description?: unknown }).description;

    if (typeof label !== "string" || typeof description !== "string") {
      return null;
    }

    options.push({ label, description });
  }

  return options;
}

export class AskUserTool extends BaseTool {
  name = "ask_user";
  description = "Ask the user a question with predefined options to gather decisions.";
  category = "interactive" as const;
  inputSchema = {
    type: "object",
    properties: {
      question: { type: "string" },
      options: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            description: { type: "string" },
          },
          required: ["label", "description"],
          additionalProperties: false,
        },
      },
    },
    required: ["question", "options"],
    additionalProperties: false,
  };

  private readonly askHandler?: AskUserHandler;

  constructor(askHandler?: AskUserHandler) {
    super();
    this.askHandler = askHandler;
  }

  async run(input: Record<string, unknown>) {
    const question = typeof input.question === "string" ? input.question.trim() : "";
    const options = parseOptions(input.options);

    if (!question || !options) {
      return {
        content: "Error: Invalid ask_user payload. Expected { question, options[2..4] }.",
        isError: true,
      };
    }

    if (!this.askHandler) {
      return {
        content: options[0]?.label ?? "No option selected",
        isError: false,
      };
    }

    const selectedLabel = await this.askHandler({ question, options });

    return {
      content: selectedLabel,
      isError: false,
    };
  }
}

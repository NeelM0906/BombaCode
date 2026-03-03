import type { Message, ToolCall } from "../llm/types.js";

/**
 * Build a lookup map from tool_use_id to the ToolCall that produced it,
 * so we can generate descriptive placeholders.
 */
function buildToolCallMap(messages: Message[]): Map<string, ToolCall> {
  const map = new Map<string, ToolCall>();
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        map.set(tc.id, tc);
      }
    }
  }
  return map;
}

/**
 * Generate a compact placeholder summary for an observed tool result.
 */
function generatePlaceholder(toolCall: ToolCall | undefined, content: string): string {
  if (!toolCall) {
    const lineCount = content.split("\n").length;
    return `[Previously observed tool result — ${lineCount} lines]`;
  }

  const name = toolCall.name;
  const input = toolCall.input;

  switch (name) {
    case "read": {
      const filePath = (input.file_path as string) ?? "file";
      const lineCount = content.split("\n").length;
      return `[Previously read ${filePath} — ${lineCount} lines]`;
    }

    case "bash": {
      const command = (input.command as string) ?? "command";
      const shortCmd = command.length > 60 ? command.slice(0, 57) + "..." : command;
      // Extract exit code hint from content if present
      const exitMatch = content.match(/exit code[:\s]*(\d+)/i);
      const exitInfo = exitMatch ? ` — exit ${exitMatch[1]}` : "";
      return `[Previously ran: ${shortCmd}${exitInfo}]`;
    }

    case "grep": {
      const pattern = (input.pattern as string) ?? "pattern";
      const matchCount = content.split("\n").filter((l) => l.trim().length > 0).length;
      return `[Previously searched for "${pattern}" — ${matchCount} matches]`;
    }

    case "glob": {
      const globPattern = (input.pattern as string) ?? "pattern";
      const matchCount = content.split("\n").filter((l) => l.trim().length > 0).length;
      return `[Previously globbed "${globPattern}" — ${matchCount} results]`;
    }

    case "write": {
      const filePath = (input.file_path as string) ?? "file";
      const lineCount = content.split("\n").length;
      return `[Previously wrote ${filePath} — ${lineCount} lines]`;
    }

    case "edit": {
      const filePath = (input.file_path as string) ?? "file";
      return `[Previously edited ${filePath}]`;
    }

    case "todo": {
      return `[Previously updated todo list]`;
    }

    case "ask_user": {
      return `[Previously asked user a question]`;
    }

    default: {
      // Generic for MCP tools and unknown tools
      const lineCount = content.split("\n").length;
      return `[Previously called ${name} — ${lineCount} lines of output]`;
    }
  }
}

/** Minimum content length to bother masking — short results aren't worth replacing */
const MIN_MASK_CONTENT_LENGTH = 200;

/**
 * Replace observed tool results with compact placeholders.
 *
 * A tool result is "observed" if the model has already responded after seeing it,
 * meaning there is an assistant message that comes AFTER the tool result in the
 * conversation history.
 *
 * The LAST group of tool results (those not yet followed by an assistant response)
 * are kept intact so the model can still reference them.
 *
 * This modifies messages in place and returns the modified array.
 */
export function maskObservedToolResults(messages: Message[]): Message[] {
  if (messages.length === 0) {
    return messages;
  }

  const toolCallMap = buildToolCallMap(messages);

  // Find the index of the last assistant message.
  // All tool results before this are "observed".
  let lastAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") {
      lastAssistantIndex = i;
      break;
    }
  }

  // If there's no assistant message, nothing has been observed yet
  if (lastAssistantIndex === -1) {
    return messages;
  }

  // Replace tool results that appear before the last assistant message
  const result: Message[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;

    if (msg.role === "tool" && i < lastAssistantIndex) {
      // Only mask if the content is long enough to be worth replacing
      if (msg.content.length >= MIN_MASK_CONTENT_LENGTH) {
        const toolCall = toolCallMap.get(msg.toolUseId);
        const placeholder = generatePlaceholder(toolCall, msg.content);
        result.push({
          role: "tool",
          toolUseId: msg.toolUseId,
          content: placeholder,
        });
      } else {
        result.push(msg);
      }
    } else {
      result.push(msg);
    }
  }

  return result;
}

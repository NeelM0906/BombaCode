import type { Message, ToolResult } from "../../llm/types.js";

/**
 * Builds a unified map of tool results by merging live results from the current
 * agent loop with results reconstructed from persisted tool messages.
 *
 * Live results (from `toolResults`) take precedence because they carry the
 * authoritative `isError` flag set by the tool router.  For historical tool
 * messages that were loaded from a saved session the `Message` type does not
 * include an `isError` field, so we fall back to a prefix heuristic
 * (`content.startsWith("Error:")`).  This is imperfect but acceptable for
 * legacy data — new results always flow through the live map first.
 */
export function buildToolResultMap(
  messages: Message[],
  toolResults?: Map<string, ToolResult>
): Map<string, ToolResult> {
  const combined = new Map<string, ToolResult>(toolResults ?? []);

  for (const message of messages) {
    if (message.role !== "tool") {
      continue;
    }

    // Live results already present in the map are authoritative; skip them.
    if (combined.has(message.toolUseId)) {
      continue;
    }

    combined.set(message.toolUseId, {
      toolUseId: message.toolUseId,
      content: message.content,
      // The persisted Message type lacks an isError field, so we infer from the
      // content prefix.  This heuristic matches the convention used by the tool
      // router when formatting error responses.
      isError: message.content.startsWith("Error:"),
    });
  }

  return combined;
}

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { BaseTool } from "./base-tool.js";
import { countChanges, generateDiff } from "../utils/diff.js";

function countOccurrences(content: string, target: string): number {
  if (target.length === 0) {
    return 0;
  }

  let count = 0;
  let index = 0;

  while (true) {
    const next = content.indexOf(target, index);
    if (next === -1) {
      break;
    }

    count += 1;
    index = next + target.length;
  }

  return count;
}

function replaceAllExact(content: string, oldString: string, newString: string): string {
  return content.split(oldString).join(newString);
}

export class EditTool extends BaseTool {
  name = "edit";
  description = [
    "Make targeted edits to an existing file using exact string matching.",
    "Provide old_string and new_string.",
    "old_string must match exactly and should be unique unless replace_all is true.",
    "Always read a file before editing it.",
  ].join(" ");
  category = "write" as const;
  inputSchema = {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Path to the file to edit." },
      old_string: { type: "string", description: "Exact text to find in the file." },
      new_string: { type: "string", description: "Replacement text." },
      replace_all: { type: "boolean", description: "Replace all occurrences when true." },
    },
    required: ["file_path", "old_string", "new_string"],
    additionalProperties: false,
  };

  async run(input: Record<string, unknown>) {
    const filePath = typeof input.file_path === "string" ? input.file_path.trim() : "";
    const oldString = typeof input.old_string === "string" ? input.old_string : "";
    const newString = typeof input.new_string === "string" ? input.new_string : "";
    const replaceAll = input.replace_all === true;

    if (!filePath) {
      return {
        content: "Error: Missing required field 'file_path'.",
        isError: true,
      };
    }

    if (oldString.length === 0) {
      return {
        content: "Error: old_string cannot be empty.",
        isError: true,
      };
    }

    if (oldString === newString) {
      return {
        content: "Error: old_string and new_string are identical.",
        isError: true,
      };
    }

    try {
      const originalContent = await readFile(filePath, "utf8");
      const matchCount = countOccurrences(originalContent, oldString);

      if (matchCount === 0) {
        return {
          content: [
            "String to replace not found in file.",
            "Make sure the text matches exactly, including whitespace and indentation.",
          ].join(" "),
          isError: true,
        };
      }

      if (matchCount >= 2 && !replaceAll) {
        return {
          content: `Found ${matchCount} matches for the replacement text. Either provide more surrounding context to make it unique, or use replace_all: true to replace every occurrence.`,
          isError: true,
        };
      }

      const updatedContent = replaceAll
        ? replaceAllExact(originalContent, oldString, newString)
        : originalContent.replace(oldString, newString);

      await mkdir(dirname(filePath), { recursive: true });
      const tempPath = `${filePath}.tmp.${randomUUID()}`;
      await writeFile(tempPath, updatedContent, "utf8");
      await rename(tempPath, filePath);

      const diff = generateDiff(originalContent, updatedContent, filePath);
      const changeCounts = countChanges(originalContent, updatedContent);
      void diff;

      return {
        content: [
          `Applied edit to ${filePath}:`,
          `- ${changeCounts.removed} lines removed`,
          `- ${changeCounts.added} lines added`,
        ].join("\n"),
        isError: false,
      };
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError?.code === "ENOENT") {
        return {
          content: `Error: File not found: ${filePath}`,
          isError: true,
        };
      }

      return {
        content: `Error: Cannot edit ${filePath}: ${nodeError?.message || String(error)}`,
        isError: true,
      };
    }
  }
}

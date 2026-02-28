import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { globby } from "globby";
import { BaseTool } from "./base-tool.js";

const MAX_GLOB_RESULTS = 1_000;

export class GlobTool extends BaseTool {
  name = "glob";
  description = [
    "Find files matching a glob pattern.",
    "Returns file paths sorted by modification time (newest first).",
    "Respects .gitignore by default.",
  ].join(" ");
  category = "readonly" as const;
  inputSchema = {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern to match." },
      path: { type: "string", description: "Directory to search in (defaults to cwd)." },
    },
    required: ["pattern"],
    additionalProperties: false,
  };

  async run(input: Record<string, unknown>) {
    const pattern = typeof input.pattern === "string" ? input.pattern.trim() : "";
    const searchPath = typeof input.path === "string" ? input.path : process.cwd();

    if (!pattern) {
      return {
        content: "Error: Missing required field 'pattern'.",
        isError: true,
      };
    }

    try {
      const cwd = resolve(searchPath);
      const matches = await globby(pattern, {
        cwd,
        gitignore: true,
        onlyFiles: true,
        absolute: true,
      });

      const withStats = await Promise.all(
        matches.map(async (filePath) => {
          const fileStat = await stat(filePath);
          return { filePath, mtimeMs: fileStat.mtimeMs };
        })
      );

      withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

      if (withStats.length === 0) {
        return {
          content: `No files found matching pattern '${pattern}'`,
          isError: false,
        };
      }

      const displayed = withStats.slice(0, MAX_GLOB_RESULTS).map((entry) => entry.filePath);
      const summary = [`Found ${withStats.length} files:`, ...displayed];

      if (withStats.length > MAX_GLOB_RESULTS) {
        summary.push(
          `[Showing first ${MAX_GLOB_RESULTS} of ${withStats.length} matches. Narrow your pattern.]`
        );
      }

      return {
        content: summary.join("\n"),
        isError: false,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: `Error: glob failed for pattern '${pattern}': ${message}`,
        isError: true,
      };
    }
  }
}

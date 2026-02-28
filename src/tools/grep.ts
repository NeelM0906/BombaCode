import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { globby } from "globby";
import { BaseTool } from "./base-tool.js";
import { truncateResult } from "./base-tool.js";

type GrepOutputMode = "files_with_matches" | "content" | "count";

const MAX_FALLBACK_FILES = 100;

function isRipgrepAvailable(): boolean {
  const check = spawnSync("rg", ["--version"], {
    stdio: "ignore",
  });

  return check.status === 0;
}

function parseOutputMode(value: unknown): GrepOutputMode {
  if (value === "content" || value === "count" || value === "files_with_matches") {
    return value;
  }

  return "files_with_matches";
}

function compilePattern(pattern: string, caseInsensitive: boolean): RegExp | null {
  try {
    return new RegExp(pattern, caseInsensitive ? "i" : "");
  } catch {
    return null;
  }
}

async function collectFallbackFiles(searchPath: string, globPattern?: string): Promise<string[]> {
  const resolved = resolve(searchPath);
  const fileStat = await stat(resolved);

  if (fileStat.isFile()) {
    return [resolved];
  }

  const patterns = globPattern ? [globPattern] : ["**/*"];
  return globby(patterns, {
    cwd: resolved,
    absolute: true,
    onlyFiles: true,
    gitignore: true,
  });
}

export class GrepTool extends BaseTool {
  name = "grep";
  description = [
    "Search file contents for a regex pattern.",
    "Uses ripgrep (rg) for speed when available, with a Node.js fallback.",
  ].join(" ");
  category = "readonly" as const;
  inputSchema = {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for." },
      path: { type: "string", description: "Directory or file to search (defaults to cwd)." },
      glob: { type: "string", description: "File pattern filter, for example *.ts." },
      output_mode: {
        type: "string",
        enum: ["files_with_matches", "content", "count"],
      },
      context: { type: "number", description: "Context lines for content output mode." },
      case_insensitive: { type: "boolean" },
    },
    required: ["pattern"],
    additionalProperties: false,
  };

  async run(input: Record<string, unknown>) {
    const pattern = typeof input.pattern === "string" ? input.pattern : "";
    const searchPath = typeof input.path === "string" ? input.path : process.cwd();
    const globPattern = typeof input.glob === "string" ? input.glob : undefined;
    const outputMode = parseOutputMode(input.output_mode);
    const context = typeof input.context === "number" && input.context > 0 ? Math.floor(input.context) : 0;
    const caseInsensitive = input.case_insensitive === true;

    if (!pattern) {
      return {
        content: "Error: Missing required field 'pattern'.",
        isError: true,
      };
    }

    const regex = compilePattern(pattern, caseInsensitive);
    if (!regex) {
      return {
        content: `Error: Invalid regex pattern '${pattern}'.`,
        isError: true,
      };
    }

    if (isRipgrepAvailable()) {
      const rgArgs = [pattern, searchPath, "--no-heading", "--hidden=false"];

      if (globPattern) {
        rgArgs.push("--glob", globPattern);
      }

      if (outputMode === "files_with_matches") {
        rgArgs.push("--files-with-matches");
      } else if (outputMode === "count") {
        rgArgs.push("--count");
      } else {
        rgArgs.push("-n");
        if (context > 0) {
          rgArgs.push("-C", String(context));
        }
      }

      if (caseInsensitive) {
        rgArgs.push("-i");
      }

      const rgRun = spawnSync("rg", rgArgs, {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      });

      if (rgRun.status === 2) {
        return {
          content: `Error: ripgrep failed: ${rgRun.stderr.trim() || "unknown error"}`,
          isError: true,
        };
      }

      const stdout = rgRun.stdout.trim();

      if (!stdout) {
        return {
          content: "No matches found.",
          isError: false,
        };
      }

      if (outputMode === "files_with_matches") {
        const lines = stdout.split("\n").filter(Boolean);
        return {
          content: truncateResult([`Found matches in ${lines.length} files:`, ...lines].join("\n")),
          isError: false,
        };
      }

      return {
        content: truncateResult(stdout),
        isError: false,
      };
    }

    try {
      const files = (await collectFallbackFiles(searchPath, globPattern)).slice(0, MAX_FALLBACK_FILES);
      const fileMatches = new Map<string, string[]>();
      const fileCounts = new Map<string, number>();

      for (const filePath of files) {
        let fileContent: string;
        try {
          fileContent = await readFile(filePath, "utf8");
        } catch {
          continue;
        }

        const lines = fileContent.split("\n");
        const matchedLineIndexes: number[] = [];

        lines.forEach((line, index) => {
          if (regex.test(line)) {
            matchedLineIndexes.push(index);
          }
          regex.lastIndex = 0;
        });

        if (matchedLineIndexes.length === 0) {
          continue;
        }

        fileCounts.set(filePath, matchedLineIndexes.length);

        if (outputMode === "content") {
          const selected = new Set<number>();
          for (const lineIndex of matchedLineIndexes) {
            const start = Math.max(0, lineIndex - context);
            const end = Math.min(lines.length - 1, lineIndex + context);
            for (let idx = start; idx <= end; idx += 1) {
              selected.add(idx);
            }
          }

          const formatted = Array.from(selected)
            .sort((a, b) => a - b)
            .map((index) => `${filePath}:${index + 1}:${lines[index]}`);

          fileMatches.set(filePath, formatted);
        }
      }

      if (fileCounts.size === 0) {
        return {
          content: "No matches found.",
          isError: false,
        };
      }

      if (outputMode === "files_with_matches") {
        const matchedFiles = Array.from(fileCounts.keys());
        return {
          content: truncateResult([`Found matches in ${matchedFiles.length} files:`, ...matchedFiles].join("\n")),
          isError: false,
        };
      }

      if (outputMode === "count") {
        const lines = Array.from(fileCounts.entries()).map(
          ([filePath, count]) => `${filePath}: ${count} matches`
        );
        return {
          content: truncateResult(lines.join("\n")),
          isError: false,
        };
      }

      const contentLines = Array.from(fileMatches.values()).flat();
      return {
        content: truncateResult(contentLines.join("\n")),
        isError: false,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: `Error: grep fallback failed: ${message}`,
        isError: true,
      };
    }
  }
}

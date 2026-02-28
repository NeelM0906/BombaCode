import chalk from "chalk";
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "./platform.js";

const DEBUG_ENABLED = process.env.BOMBA_DEBUG === "1";

function getLogFilePath(): string {
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, "debug.log");
}

function timestamp(): string {
  return new Date().toISOString();
}

function writeToFile(level: string, message: string, ...args: unknown[]): void {
  if (!DEBUG_ENABLED) return;
  try {
    const line = `[${timestamp()}] [${level}] ${message} ${args.length > 0 ? JSON.stringify(args) : ""}\n`;
    appendFileSync(getLogFilePath(), line);
  } catch {
    // Silently fail — logging should never crash the app
  }
}

export const logger = {
  info(message: string, ...args: unknown[]): void {
    writeToFile("INFO", message, ...args);
  },

  warn(message: string, ...args: unknown[]): void {
    if (DEBUG_ENABLED) {
      console.error(chalk.yellow(`[WARN] ${message}`), ...args);
    }
    writeToFile("WARN", message, ...args);
  },

  error(message: string, ...args: unknown[]): void {
    console.error(chalk.red(`[ERROR] ${message}`), ...args);
    writeToFile("ERROR", message, ...args);
  },

  debug(message: string, ...args: unknown[]): void {
    if (DEBUG_ENABLED) {
      console.error(chalk.gray(`[DEBUG] ${message}`), ...args);
    }
    writeToFile("DEBUG", message, ...args);
  },
};

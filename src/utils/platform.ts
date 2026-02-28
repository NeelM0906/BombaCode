import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Get the BombaCode config directory (~/.bombacode/)
 */
export function getConfigDir(): string {
  return join(homedir(), ".bombacode");
}

/**
 * Get the current operating system
 */
export function getOS(): "darwin" | "linux" | "win32" | string {
  return process.platform;
}

/**
 * Get the user's default shell
 */
export function getShell(): string {
  return process.env.SHELL || (process.platform === "win32" ? "cmd.exe" : "/bin/sh");
}

/**
 * Get the current working directory
 */
export function getCwd(): string {
  return process.cwd();
}

/**
 * Get terminal dimensions
 */
export function getTerminalSize(): { columns: number; rows: number } {
  return {
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  };
}

/**
 * Check if running in CI environment
 */
export function isCI(): boolean {
  return !!(process.env.CI || process.env.CONTINUOUS_INTEGRATION || process.env.GITHUB_ACTIONS);
}

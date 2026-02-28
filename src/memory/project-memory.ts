import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadProjectMemory(cwd: string): string {
  const memoryPath = join(cwd, "BOMBA.md");
  try {
    return readFileSync(memoryPath, "utf8");
  } catch {
    return "";
  }
}

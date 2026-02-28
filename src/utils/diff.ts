import { createPatch } from "diff";

export function createUnifiedDiff(fileName: string, before: string, after: string): string {
  return createPatch(fileName, before, after);
}

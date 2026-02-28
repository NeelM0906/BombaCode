import { createPatch } from "diff";

export interface ChangeCount {
  added: number;
  removed: number;
}

export function generateDiff(oldContent: string, newContent: string, filePath: string): string {
  return createPatch(filePath, oldContent, newContent, "before", "after");
}

export function countChanges(oldContent: string, newContent: string): ChangeCount {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix + prefix < oldLines.length &&
    suffix + prefix < newLines.length &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const removed = Math.max(0, oldLines.length - prefix - suffix);
  const added = Math.max(0, newLines.length - prefix - suffix);

  return { added, removed };
}

export function applyUnifiedDiff(content: string, _unifiedDiff: string): string {
  throw new Error(
    `applyUnifiedDiff is not implemented in Phase 2. Received content length ${content.length}.`
  );
}

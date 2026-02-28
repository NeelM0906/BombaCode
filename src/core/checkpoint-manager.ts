import { readFileSync, writeFileSync } from "node:fs";

export interface FileCheckpoint {
  path: string;
  content: string;
}

export class CheckpointManager {
  create(path: string): FileCheckpoint {
    return { path, content: readFileSync(path, "utf8") };
  }

  restore(checkpoint: FileCheckpoint): void {
    writeFileSync(checkpoint.path, checkpoint.content, "utf8");
  }
}

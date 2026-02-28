import { unlink, readFile, writeFile } from "node:fs/promises";

export interface FileSnapshot {
  filePath: string;
  content: string | null;
  timestamp: number;
}

export class CheckpointManager {
  private stack: FileSnapshot[] = [];
  private readonly maxSnapshots = 50;

  async snapshot(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, "utf8");
      this.stack.push({ filePath, content, timestamp: Date.now() });
    } catch {
      this.stack.push({ filePath, content: null, timestamp: Date.now() });
    }

    if (this.stack.length > this.maxSnapshots) {
      this.stack = this.stack.slice(-this.maxSnapshots);
    }
  }

  async undo(): Promise<{ filePath: string; restored: boolean } | null> {
    const snapshot = this.stack.pop();
    if (!snapshot) {
      return null;
    }

    if (snapshot.content === null) {
      await unlink(snapshot.filePath).catch(() => undefined);
      return { filePath: snapshot.filePath, restored: true };
    }

    await writeFile(snapshot.filePath, snapshot.content, "utf8");
    return { filePath: snapshot.filePath, restored: true };
  }

  getUndoCount(): number {
    return this.stack.length;
  }

  getLastSnapshot(): FileSnapshot | undefined {
    return this.stack[this.stack.length - 1];
  }

  clear(): void {
    this.stack = [];
  }
}

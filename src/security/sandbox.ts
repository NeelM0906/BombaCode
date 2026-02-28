export type SandboxMode = "danger-full-access" | "workspace-write" | "read-only";

export class Sandbox {
  constructor(private readonly mode: SandboxMode) {}

  getMode(): SandboxMode {
    return this.mode;
  }
}

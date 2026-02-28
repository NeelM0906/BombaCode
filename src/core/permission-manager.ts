export type PermissionDecision = "allow" | "deny" | "ask";

export interface PermissionState {
  allowFileWrite: PermissionDecision;
  allowBash: PermissionDecision;
  allowNetwork: PermissionDecision;
}

export class PermissionManager {
  constructor(private readonly state: PermissionState) {}

  can(action: keyof PermissionState): PermissionDecision {
    return this.state[action];
  }
}

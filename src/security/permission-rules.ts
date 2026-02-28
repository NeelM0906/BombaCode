export interface PermissionRules {
  allowFileWrite: "allow" | "deny" | "ask";
  allowBash: "allow" | "deny" | "ask";
  allowNetwork: "allow" | "deny" | "ask";
}

export const defaultPermissionRules: PermissionRules = {
  allowFileWrite: "ask",
  allowBash: "ask",
  allowNetwork: "ask",
};

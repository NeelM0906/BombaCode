declare module "marked-terminal" {
  interface TerminalRendererOptions {
    showSectionPrefix?: boolean;
    reflowText?: boolean;
    width?: number;
    tab?: number;
  }
  export function markedTerminal(options?: TerminalRendererOptions): Record<string, unknown>;
  export default markedTerminal;
}

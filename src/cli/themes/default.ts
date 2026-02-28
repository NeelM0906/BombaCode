export const defaultTheme = {
  brand: "cyan",
  success: "green",
  danger: "red",
  warning: "yellow",
  info: "blue",
} as const;

export type Theme = typeof defaultTheme;

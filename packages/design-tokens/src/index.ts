export const colors = {
  ink: "#0d1321",
  slate: "#44536f",
  paper: "#f6f4ee",
  mist: "#dfe7f5",
  cobalt: "#2456d3",
  amber: "#ed9f2f",
  pine: "#2b6e5b",
  danger: "#b42318"
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48
} as const;

export const radii = {
  sm: 10,
  md: 18,
  lg: 28
} as const;

export const shadows = {
  card: "0 20px 50px rgba(13, 19, 33, 0.12)",
  board: "0 24px 80px rgba(36, 86, 211, 0.18)"
} as const;

export const typography = {
  display: "\"Space Grotesk\", \"Segoe UI\", sans-serif",
  body: "\"IBM Plex Sans\", \"Segoe UI\", sans-serif",
  mono: "\"IBM Plex Mono\", monospace"
} as const;

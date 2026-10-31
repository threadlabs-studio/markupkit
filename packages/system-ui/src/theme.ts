export type ColorPreference = "system" | "light" | "dark";
export type AccentSeed = "system" | string | { readonly light: string; readonly dark: string };
export interface SystemTheme {
  readonly colorScheme?: ColorPreference;
  readonly accent?: AccentSeed;
  readonly typography?: "system" | "serif";
  readonly spacing?: "system" | "compact" | "comfortable";
  readonly shape?: { readonly action?: "system" | "round"; readonly field?: "system"; readonly surface?: "system" | "soft" | "round" };
  readonly motion?: "system" | "reduced";
}
export interface ThemePreferences {
  readonly colorScheme: ColorPreference;
  readonly accent: AccentSeed;
  readonly typography: "system" | "serif";
  readonly spacing: "system" | "compact" | "comfortable";
  readonly shape: { readonly action: "system" | "round"; readonly field: "system"; readonly surface: "system" | "soft" | "round" };
  readonly motion: "system" | "reduced";
}
export interface ThemeEnvironment {
  readonly colorScheme: "light" | "dark";
  readonly forcedColors?: boolean;
  readonly reducedMotion?: boolean;
}
export type ResolvedAccent = { readonly kind: "system" } | { readonly kind: "custom"; readonly fill: string; readonly foreground: "#000000" | "#ffffff"; readonly contrast: number };
export interface ResolvedSystemTheme {
  readonly preferences: ThemePreferences;
  readonly colorScheme: "light" | "dark";
  readonly accent: ResolvedAccent;
  readonly typography: ThemePreferences["typography"];
  readonly spacing: ThemePreferences["spacing"];
  readonly shape: ThemePreferences["shape"];
  readonly motion: "full" | "reduced";
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${path}: expected a theme object`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new TypeError(`${path}.${key}: unsupported theme property`);
}
function choice<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new TypeError(`${path}: expected ${allowed.join(", ")}`);
  return value as T;
}
function color(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value)) throw new TypeError(`${path}: expected a six-digit sRGB hex color`);
  return value.toLowerCase();
}
function accent(value: unknown): AccentSeed {
  if (value === "system") return value;
  if (typeof value === "string") return color(value, "accent");
  const pair = object(value, "accent"); keys(pair, ["light", "dark"], "accent");
  return Object.freeze({ light: color(pair.light, "accent.light"), dark: color(pair.dark, "accent.dark") });
}
function preferences(input: unknown, parent?: ThemePreferences): ThemePreferences {
  const theme = object(input === undefined ? {} : input, "theme");
  keys(theme, ["colorScheme", "accent", "typography", "spacing", "shape", "motion"], "theme");
  const shape = theme.shape === undefined ? {} : object(theme.shape, "shape");
  keys(shape, ["action", "field", "surface"], "shape");
  return Object.freeze({
    colorScheme: theme.colorScheme === undefined ? parent?.colorScheme ?? "system" : choice(theme.colorScheme, ["system", "light", "dark"], "colorScheme"),
    accent: theme.accent === undefined ? parent?.accent ?? "system" : accent(theme.accent),
    typography: theme.typography === undefined ? parent?.typography ?? "system" : choice(theme.typography, ["system", "serif"], "typography"),
    spacing: theme.spacing === undefined ? parent?.spacing ?? "system" : choice(theme.spacing, ["system", "compact", "comfortable"], "spacing"),
    shape: Object.freeze({
      action: shape.action === undefined ? parent?.shape.action ?? "system" : choice(shape.action, ["system", "round"], "shape.action"),
      field: shape.field === undefined ? parent?.shape.field ?? "system" : choice(shape.field, ["system"], "shape.field"),
      surface: shape.surface === undefined ? parent?.shape.surface ?? "system" : choice(shape.surface, ["system", "soft", "round"], "shape.surface"),
    }),
    motion: theme.motion === undefined ? parent?.motion ?? "system" : choice(theme.motion, ["system", "reduced"], "motion"),
  });
}
function resolveAccent(seed: AccentSeed, scheme: "light" | "dark"): ResolvedAccent {
  if (seed === "system") return Object.freeze({ kind: "system" });
  const fill = typeof seed === "string" ? seed : seed[scheme];
  const channels = [1, 3, 5].map(index => Number.parseInt(fill.slice(index, index + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  const black = (luminance + 0.05) / 0.05, white = 1.05 / (luminance + 0.05);
  return Object.freeze({ kind: "custom", fill, foreground: black >= white ? "#000000" : "#ffffff", contrast: Math.max(black, white) });
}

/** Resolve a theme scope without reading DOM or OS globals. Native/web presenters supply the environment. */
export function resolveSystemTheme(input: unknown, environment: ThemeEnvironment, parent?: ThemePreferences): ResolvedSystemTheme {
  const pref = preferences(input, parent === undefined ? undefined : preferences(parent));
  const systemScheme = choice(environment.colorScheme, ["light", "dark"], "environment.colorScheme");
  const colorScheme = environment.forcedColors || pref.colorScheme === "system" ? systemScheme : pref.colorScheme;
  return Object.freeze({ preferences: pref, colorScheme,
    accent: resolveAccent(environment.forcedColors ? "system" : pref.accent, colorScheme),
    typography: pref.typography, spacing: pref.spacing, shape: pref.shape,
    motion: environment.reducedMotion || pref.motion === "reduced" ? "reduced" : "full" });
}

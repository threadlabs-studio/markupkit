import { describe, expect, it } from "vitest";
import { resolveSystemTheme } from "../../src/index.js";

describe("bounded System UI themes", () => {
  it("keeps a complete host-led default and lets system reset an inherited preference", () => {
    const parent = resolveSystemTheme({ accent: "#35684f", typography: "serif", shape: { action: "round" } }, { colorScheme: "light" });
    const child = resolveSystemTheme({ accent: "system", shape: { surface: "soft" } }, { colorScheme: "dark" }, parent.preferences);
    expect(child).toMatchObject({ colorScheme: "dark", accent: { kind: "system" }, typography: "serif", shape: { action: "round", field: "system", surface: "soft" } });
    expect(parent.shape.surface).toBe("system");
  });

  it("resolves paired light/dark accents with legible action foregrounds", () => {
    const theme = { accent: { light: "#a83d1a", dark: "#ffb082" } };
    const light = resolveSystemTheme(theme, { colorScheme: "light" }).accent;
    const dark = resolveSystemTheme(theme, { colorScheme: "dark" }).accent;
    expect(light).toMatchObject({ kind: "custom", fill: "#a83d1a", foreground: "#ffffff" });
    expect(dark).toMatchObject({ kind: "custom", fill: "#ffb082", foreground: "#000000" });
    if (light.kind !== "custom" || dark.kind !== "custom") throw new Error("Expected custom accents");
    expect(light.contrast).toBeGreaterThanOrEqual(4.5);
    expect(dark.contrast).toBeGreaterThanOrEqual(4.5);
  });

  it("resolves accessibility preferences after product styling", () => {
    expect(resolveSystemTheme({ accent: "#ffffff", colorScheme: "light" }, { colorScheme: "dark", forcedColors: true, reducedMotion: true }))
      .toMatchObject({ colorScheme: "dark", accent: { kind: "system" }, motion: "reduced" });
    expect(resolveSystemTheme({ motion: "reduced" }, { colorScheme: "light", reducedMotion: false }).motion).toBe("reduced");
  });

  it("diagnoses unsupported styles rather than silently accepting CSS or numeric geometry", () => {
    for (const [input, path] of [[{ accent: "var(--brand)" }, "accent"], [{ shape: { action: 999 } }, "shape.action"], [{ shape: { field: "round" } }, "shape.field"], [{ opacity: 0.2 }, "opacity"], [{ spacing: null }, "spacing"], [{ accent: { light: "#ff0000" } }, "accent.dark"]] as const) {
      expect(() => resolveSystemTheme(input, { colorScheme: "light" })).toThrow(path);
    }
  });
});

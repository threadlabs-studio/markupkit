import { describe, expect, it } from "vitest";
import { createWebThemeScope } from "../../src/web.js";

// Only DOM ownership and media-query lifecycle are simulated here; rendered Looma
// colors and component options require the browser integration check.
function fixture() {
  const attributes = new Map<string, string>();
  const styles = new Map<string, [string, string]>();
  const queries = new Map<string, { matches: boolean; listeners: Set<() => void> }>();
  const root = {
    ownerDocument: { defaultView: { matchMedia(name: string) {
      const state = { matches: false, listeners: new Set<() => void>() };
      queries.set(name, state);
      return { get matches() { return state.matches; }, addEventListener(_event: string, listener: () => void) { state.listeners.add(listener); }, removeEventListener(_event: string, listener: () => void) { state.listeners.delete(listener); } };
    } } },
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => { attributes.set(name, value); },
    removeAttribute: (name: string) => { attributes.delete(name); },
    style: {
      getPropertyValue: (name: string) => styles.get(name)?.[0] ?? "",
      getPropertyPriority: (name: string) => styles.get(name)?.[1] ?? "",
      setProperty: (name: string, value: string, priority = "") => { styles.set(name, [value, priority]); },
      removeProperty: (name: string) => { styles.delete(name); },
    },
  } as unknown as HTMLElement;
  return { root, styles, queries, change(query: string, matches: boolean) {
    const state = queries.get(query)!;
    state.matches = matches;
    for (const listener of state.listeners) listener();
  } };
}

describe("System UI web theme scopes", () => {
  it("tracks system appearance, paired accent foregrounds and accessibility changes", () => {
    const f = fixture();
    const scope = createWebThemeScope(f.root, { accent: { light: "#a83d1a", dark: "#ffb082" } });
    expect(f.styles.get("--ui-on-accent")?.[0]).toBe("#ffffff");
    const seen: string[] = [];
    const unsubscribe = scope.subscribe(theme => { seen.push(theme.colorScheme); });
    f.change("(prefers-color-scheme: dark)", true);
    expect(f.root.getAttribute("data-theme")).toBe("dark");
    expect(f.styles.get("--ui-accent")?.[0]).toBe("#ffb082");
    expect(f.styles.get("--ui-on-accent")?.[0]).toBe("#000000");
    f.change("(forced-colors: active)", true);
    expect(f.styles.has("--ui-accent")).toBe(false);
    expect(scope.snapshot().accent.kind).toBe("system");
    f.change("(prefers-reduced-motion: reduce)", true);
    expect(f.styles.get("--ui-motion-fast")?.[0]).toBe("0ms");
    unsubscribe();
    const count = seen.length;
    f.change("(prefers-reduced-motion: reduce)", false);
    expect(f.styles.has("--ui-motion-fast")).toBe(false);
    expect(seen).toHaveLength(count);
    scope.dispose();
  });

  it("owns only its theme attributes, restoring previous values and media listeners", () => {
    const f = fixture();
    f.root.setAttribute("data-theme", "custom");
    f.root.style.setProperty("--ui-accent", "#123456", "important");
    f.root.style.setProperty("padding", "12px");
    const scope = createWebThemeScope(f.root, { accent: "#abcdef", motion: "reduced" });
    expect(() => createWebThemeScope(f.root)).toThrow("already");
    scope.dispose();
    scope.dispose();
    expect(f.root.getAttribute("data-theme")).toBe("custom");
    expect(f.styles.get("--ui-accent")).toEqual(["#123456", "important"]);
    expect(f.styles.get("padding")?.[0]).toBe("12px");
    expect([...f.queries.values()].every(query => query.listeners.size === 0)).toBe(true);
    expect(() => scope.update({})).toThrow("disposed");
    const replacement = createWebThemeScope(f.root);
    replacement.dispose();
  });

  it("validates updates atomically and isolates caller input and sibling roots", () => {
    const a = fixture(), b = fixture();
    const input = { accent: { light: "#112233", dark: "#ddeeff" } };
    const first = createWebThemeScope(a.root, input);
    const second = createWebThemeScope(b.root);
    input.accent.dark = "#ffffff";
    a.change("(prefers-color-scheme: dark)", true);
    expect(a.styles.get("--ui-accent")?.[0]).toBe("#ddeeff");
    expect(b.root.getAttribute("data-theme")).toBe("light");
    expect(() => first.update({ spacing: 12 })).toThrow("spacing");
    expect(first.snapshot().accent).toMatchObject({ fill: "#ddeeff" });
    first.update({ accent: "system" }, second.snapshot().preferences);
    expect(a.styles.has("--ui-accent")).toBe(false);
    first.dispose(); second.dispose();
  });
});

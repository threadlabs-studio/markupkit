import { resolveSystemTheme } from "./theme.js";
import type { ResolvedSystemTheme, ThemePreferences } from "./theme.js";

export interface WebThemeScope {
  snapshot(): ResolvedSystemTheme;
  /** Replace this scope's preferences. Omitted fields inherit the supplied parent. */
  update(input: unknown, parent?: ThemePreferences): void;
  subscribe(listener: (theme: ResolvedSystemTheme) => void): () => void;
  dispose(): void;
}

const owners = new WeakSet<HTMLElement>();
const properties = ["--ui-accent", "--ui-on-accent", "--ui-motion-fast"] as const;

/** Apply Looma's public theme seeds without importing its components or owning layout. */
export function createWebThemeScope(root: HTMLElement, input: unknown = {}, parent?: ThemePreferences): WebThemeScope {
  if (owners.has(root)) throw new Error("This element already has a System UI theme scope");
  const view = root.ownerDocument.defaultView;
  if (!view) throw new Error("A System UI web theme scope requires a document with a window");
  const dark = view.matchMedia("(prefers-color-scheme: dark)");
  const contrast = view.matchMedia("(forced-colors: active)");
  const motion = view.matchMedia("(prefers-reduced-motion: reduce)");
  const environment = () => ({ colorScheme: dark.matches ? "dark" as const : "light" as const, forcedColors: contrast.matches, reducedMotion: motion.matches });
  let current = resolveSystemTheme(input, environment(), parent);
  // Preserve validated preferences, rather than the caller's mutable input object.
  let preferences = current.preferences;
  const attribute = root.getAttribute("data-theme");
  const original = properties.map(name => ({ name, value: root.style.getPropertyValue(name), priority: root.style.getPropertyPriority(name) }));
  const listeners = new Set<(theme: ResolvedSystemTheme) => void>();
  let disposed = false;
  function restore(name: typeof properties[number]): void {
    const saved = original.find(property => property.name === name)!;
    if (saved.value) root.style.setProperty(name, saved.value, saved.priority);
    else root.style.removeProperty(name);
  }
  function apply(): void {
    root.setAttribute("data-theme", current.colorScheme);
    if (current.accent.kind === "custom") {
      root.style.setProperty("--ui-accent", current.accent.fill);
      root.style.setProperty("--ui-on-accent", current.accent.foreground);
    } else {
      restore("--ui-accent");
      restore("--ui-on-accent");
    }
    if (current.motion === "reduced") root.style.setProperty("--ui-motion-fast", "0ms");
    else restore("--ui-motion-fast");
  }
  function publish(): void {
    apply();
    for (const listener of listeners) listener(current);
  }
  function changed(): void {
    if (disposed) return;
    current = resolveSystemTheme(preferences, environment());
    publish();
  }
  owners.add(root);
  apply();
  for (const query of [dark, contrast, motion]) query.addEventListener("change", changed);
  return {
    snapshot: () => current,
    update(next, inherited) {
      if (disposed) throw new Error("Cannot update a disposed System UI theme scope");
      const resolved = resolveSystemTheme(next, environment(), inherited);
      preferences = resolved.preferences;
      current = resolved;
      publish();
    },
    subscribe(listener) {
      if (disposed) throw new Error("Cannot subscribe to a disposed System UI theme scope");
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const query of [dark, contrast, motion]) query.removeEventListener("change", changed);
      listeners.clear();
      if (attribute === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", attribute);
      for (const name of properties) restore(name);
      owners.delete(root);
    },
  };
}

export { bindTextEditor } from "./text-editor-web.js";

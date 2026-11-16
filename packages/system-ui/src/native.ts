/** Build-time registration data; does not load a presenter or execute browser behavior. */
export interface SystemUINativeBinding {
  readonly definition: string;
  readonly contractRevision: string;
  readonly implementations: Readonly<Record<"ios" | "macos" | "android", string>>;
  readonly sources: Readonly<Record<"ios" | "macos" | "android", readonly string[]>>;
}

// These are qualified interface locks, not revisions recalculated by an application's build.
const components = [
  ["text-editor", "SystemTextEditor", "sha256:0e197d17ad01347b45307d286b236f807d8952464b875fdf6143e90c500b49ef"],
  ["collection", "SystemCollection", "sha256:fb74f791978c13d903744801cca5f7e824b41b929546a36365e80db27239440a"],
  ["collection-detail", "SystemCollectionDetail", "sha256:bca73d56baa0d0c16ae65fe9f451d43016d863192bad098fbe9452ba89cb4628"],
] as const;

/**
 * Select these bindings explicitly alongside custom native implementations. The resolver maps
 * public package resources to canonical URLs; pass a resolver when staging resources elsewhere.
 * Sources identify presenter files only. The host still supplies platform dependencies and wiring.
 */
export function systemUINativeBindings(resolve: (specifier: string) => string = specifier => import.meta.resolve(specifier)): readonly SystemUINativeBinding[] {
  return components.map(([resource, name, contractRevision]) => {
    const apple = resolve(`@threadlabs/system-ui/native/${name}.swift`);
    return {
      definition: resolve(`@threadlabs/system-ui/components/${resource}.html`),
      contractRevision,
      implementations: { ios: name, macos: name, android: `studio.threadlabs.systemui.${name}` },
      sources: { ios: [apple], macos: [apple], android: [resolve(`@threadlabs/system-ui/native/android/studio/threadlabs/systemui/${name}.java`)] },
    };
  });
}

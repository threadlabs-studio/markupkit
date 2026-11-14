export interface NavigationEntry<Destination> {
  readonly id: string;
  readonly destination: Destination;
}
export type NavigationRequest<Destination> =
  | { readonly kind: "push" | "replace"; readonly entryId: string; readonly destination: Destination }
  | { readonly kind: "back"; readonly entryId: string };
export interface NavigationTransition<Destination> {
  readonly id: string;
  readonly kind: "push" | "replace" | "back";
  readonly entryId: string;
  readonly target: NavigationEntry<Destination>;
}
export interface NavigationSnapshot<Destination> {
  readonly sceneId: string;
  readonly revision: number;
  readonly active: boolean;
  readonly entries: readonly NavigationEntry<Destination>[];
  readonly pending: NavigationTransition<Destination> | null;
}
export interface NavigationScene<Destination> {
  snapshot(): NavigationSnapshot<Destination>;
  /** Request only after application authorization and editing-leave policy allow it. */
  request(request: NavigationRequest<Destination>): NavigationTransition<Destination> | null;
  complete(transitionId: string, result: "committed" | "cancelled"): void;
  dispose(): void;
}

let nextScene = 0;

/**
 * A platform-independent visit stack. Destinations have already been resolved and validated by
 * the application/router. The presenter confirms completion; a gesture proposal alone never pops.
 */
export function createNavigationScene<Destination>(options: {
  readonly destination: Destination;
  /** Isolate mutable destination parameters from callers and presentation snapshots. */
  readonly copy: (destination: Destination) => Destination;
}): NavigationScene<Destination> {
  const { copy } = options;
  const sceneId = `scene-${++nextScene}`;
  let nextEntry = 0, nextTransition = 0, revision = 0, active = true;
  const entry = (destination: Destination): NavigationEntry<Destination> => ({ id: `${sceneId}/entry-${++nextEntry}`, destination: copy(destination) });
  let entries = [entry(options.destination)];
  let pending: NavigationTransition<Destination> | null = null;
  const copyEntry = (value: NavigationEntry<Destination>): NavigationEntry<Destination> => ({ id: value.id, destination: copy(value.destination) });
  const copyTransition = (value: NavigationTransition<Destination>): NavigationTransition<Destination> => ({ ...value, target: copyEntry(value.target) });
  return {
    snapshot: () => ({ sceneId, revision, active, entries: entries.map(copyEntry), pending: pending === null ? null : copyTransition(pending) }),
    request(request) {
      if (!active || request.entryId !== entries.at(-1)!.id) return null;
      if (request.kind !== "push" && request.kind !== "replace" && request.kind !== "back") throw new TypeError("Unknown navigation request kind");
      if (request.kind === "back" && entries.length === 1) return null;
      const target = request.kind === "back" ? entries[entries.length - 2]! : entry(request.destination);
      const transition = { id: `${sceneId}/transition-${++nextTransition}`, kind: request.kind, entryId: request.entryId, target };
      // Copy before publishing so an application copy failure leaves the old request intact.
      const result = copyTransition(transition);
      pending = transition;
      revision++;
      return result;
    },
    complete(transitionId, result) {
      if (!active || pending === null || transitionId !== pending.id) return;
      if (result !== "committed" && result !== "cancelled") throw new TypeError("Unknown navigation transition result");
      if (result === "committed") {
        if (pending.kind === "back") entries = entries.slice(0, -1);
        else if (pending.kind === "replace") entries = [...entries.slice(0, -1), pending.target];
        else entries = [...entries, pending.target];
      }
      pending = null;
      revision++;
    },
    dispose() {
      if (!active) return;
      active = false; pending = null; revision++;
    },
  };
}

/** Provider-owned revisions are opaque; System UI never assumes a numeric sequence. */
export type ResourceVersion = string | number | bigint;
export type LeaveChoice = "save" | "discard" | "stay";

export interface EditingOptions<Value> {
  readonly resource: string;
  readonly value: Value;
  readonly version: ResourceVersion;
  readonly operation: string;
  readonly whenDirty?: "confirm" | "discard";
  /** Copy application values so a presenter, provider or earlier snapshot cannot mutate the draft. */
  readonly copy: (value: Value) => Value;
  readonly equal: (left: Value, right: Value) => boolean;
}
export type CommitResult<Value> =
  | { readonly kind: "ok"; readonly value: Value; readonly version: ResourceVersion }
  | { readonly kind: "error" | "conflict"; readonly message?: string };
export type EditingIntent<Value> =
  | { readonly type: "edit"; readonly sessionId: string; readonly value: Value; readonly inputId?: string }
  | { readonly type: "save"; readonly sessionId: string }
  | { readonly type: "leave"; readonly destination: string }
  | { readonly type: "choose-leave"; readonly sessionId: string; readonly leaveId: string; readonly choice: LeaveChoice }
  | { readonly type: "navigation-result"; readonly sessionId: string; readonly navigationId: string; readonly result: "committed" | "cancelled" }
  | { readonly type: "commit-result"; readonly operationId: string; readonly result: CommitResult<Value> };
export interface CommitEffect<Value> {
  readonly kind: "commit";
  readonly operationId: string;
  readonly operation: string;
  readonly sessionId: string;
  readonly resource: string;
  readonly value: Value;
  readonly expectedVersion: ResourceVersion;
}
export type EditingEffect<Value> = CommitEffect<Value> | { readonly kind: "navigate"; readonly navigationId: string; readonly destination: string };
export interface EditingSnapshot<Value> {
  /** Opaque presenter identity echoed by the latest accepted edit, including equal values. */
  readonly inputId?: string;
  /** Advances for each accepted edit, independently of save/status projection changes. */
  readonly inputRevision: number;
  readonly revision: number;
  readonly sessionId: string;
  readonly resource: string;
  readonly value: Value;
  readonly version: ResourceVersion;
  readonly active: boolean;
  readonly dirty: boolean;
  readonly pending: boolean;
  readonly saveEnabled: boolean;
  readonly status: "clean" | "dirty" | "saving" | "newer-edits" | "error" | "conflict";
  readonly error: string | null;
  readonly leave: { readonly id: string; readonly destination: string; readonly phase: "confirming" | "saving" | "navigating"; readonly navigationId?: string; readonly discardEnabled: boolean } | null;
}
export interface EditingTransition<Value> {
  readonly snapshot: EditingSnapshot<Value>;
  readonly effects: readonly EditingEffect<Value>[];
}
export interface EditingSession<Value> {
  snapshot(): EditingSnapshot<Value>;
  dispatch(intent: EditingIntent<Value>): EditingTransition<Value>;
  /** Stops accepting intents and results. It does not claim to cancel a provider write. */
  dispose(): void;
}

let nextSession = 0;

function version(value: ResourceVersion): void {
  if (typeof value !== "string" && typeof value !== "bigint" && !(typeof value === "number" && Number.isFinite(value))) {
    throw new TypeError("A resource version must be a string, bigint or finite number");
  }
}

/**
 * One editing visit. Presenters submit intents and perform returned effects; the session owns
 * dirty state, single-flight Save and leave decisions without accessing UI, storage or timers.
 */
export function createEditingSession<Value>(options: EditingOptions<Value>): EditingSession<Value> {
  if (typeof options.resource !== "string" || !options.resource || typeof options.operation !== "string" || !options.operation) throw new TypeError("An editor requires a resource and commit operation");
  if (options.whenDirty !== undefined && options.whenDirty !== "confirm" && options.whenDirty !== "discard") throw new TypeError("Unknown dirty-leave policy");
  version(options.version);
  const { copy, equal, resource, operation, whenDirty } = options;
  const sessionId = `editing-${++nextSession}`;
  let value = copy(options.value), baseline = copy(options.value), currentVersion = options.version;
  let active = true, revision = 0, inputRevision = 0, editRevision = 0, nextOperation = 0, nextNavigation = 0, nextLeave = 0, newerEdits = false;
  let inputId: string | undefined;
  let pending: { operationId: string; editRevision: number } | null = null;
  let leave: { id: string; destination: string; phase: "confirming" | "saving" | "navigating"; navigationId?: string } | null = null;
  let error: string | null = null, failure: "error" | "conflict" | null = null;
  const dirty = () => !equal(value, baseline);
  function snapshot(): EditingSnapshot<Value> {
    const changed = dirty();
    return { revision, inputRevision, sessionId, resource, ...(inputId === undefined ? {} : { inputId }), value: copy(value), version: currentVersion, active,
      dirty: changed, pending: pending !== null, saveEnabled: active && changed && pending === null,
      status: failure ?? (pending ? "saving" : changed ? newerEdits ? "newer-edits" : "dirty" : "clean"), error,
      leave: leave === null ? null : { ...leave, discardEnabled: pending === null && leave.phase !== "navigating" } };
  }
  function navigate(destination: string, effects: EditingEffect<Value>[]): void {
    const navigationId = `${sessionId}/navigation-${++nextNavigation}`;
    leave = { id: leave?.id ?? `${sessionId}/leave-${++nextLeave}`, destination, phase: "navigating", navigationId };
    effects.push({ kind: "navigate", navigationId, destination });
  }
  function save(effects: EditingEffect<Value>[]): void {
    if (pending !== null || !dirty()) return;
    const submitted = copy(value);
    const operationId = `${sessionId}/commit-${++nextOperation}`;
    pending = { operationId, editRevision };
    error = null; failure = null;
    effects.push({ kind: "commit", operationId, operation, sessionId, resource,
      value: submitted, expectedVersion: currentVersion });
  }
  function dispatch(intent: EditingIntent<Value>): EditingTransition<Value> {
    const effects: EditingEffect<Value>[] = [];
    if (!active || "sessionId" in intent && intent.sessionId !== sessionId) return { snapshot: snapshot(), effects };
    switch (intent.type) {
      case "edit":
        if (intent.inputId !== undefined && (typeof intent.inputId !== "string" || !intent.inputId)) throw new TypeError("An input identity must be nonempty text");
        if (!equal(value, intent.value)) {
          value = copy(intent.value); editRevision++; newerEdits = false; error = null; failure = null;
          if (leave?.phase === "navigating") leave = null;
        }
        inputId = intent.inputId; inputRevision++;
        break;
      case "save":
        if (leave?.phase === "navigating" && dirty()) leave = null;
        save(effects); break;
      case "leave":
        leave = { id: `${sessionId}/leave-${++nextLeave}`, destination: intent.destination, phase: "confirming" };
        if (pending === null && (!dirty() || whenDirty === "discard")) navigate(intent.destination, effects);
        break;
      case "choose-leave":
        if (leave === null || intent.leaveId !== leave.id) return { snapshot: snapshot(), effects };
        if (intent.choice === "stay") leave = null;
        else if (leave.phase === "navigating") break;
        else if (intent.choice === "discard") { if (pending === null) navigate(leave.destination, effects); }
        else if (intent.choice === "save") {
          if (!dirty() && pending === null) navigate(leave.destination, effects);
          else { leave.phase = "saving"; save(effects); }
        } else throw new TypeError("Unknown leave choice");
        break;
      case "navigation-result":
        if (leave?.phase !== "navigating" || leave.navigationId !== intent.navigationId) return { snapshot: snapshot(), effects };
        if (intent.result !== "committed" && intent.result !== "cancelled") throw new TypeError("Unknown navigation result");
        if (intent.result === "committed") active = false;
        leave = null;
        break;
      case "commit-result": {
        if (pending === null || intent.operationId !== pending.operationId) return { snapshot: snapshot(), effects };
        const result = intent.result;
        if (result.kind === "ok") {
          version(result.version);
          const accepted = copy(result.value);
          const current = editRevision === pending.editRevision ? copy(accepted) : value;
          baseline = accepted; value = current; currentVersion = result.version;
          error = null; failure = null; pending = null; newerEdits = dirty();
          if (leave?.phase === "saving") {
            if (!dirty()) navigate(leave.destination, effects);
            else leave.phase = "confirming";
          }
        } else if (result.kind === "error" || result.kind === "conflict") {
          if (result.message !== undefined && typeof result.message !== "string") throw new TypeError("A commit failure message must be text");
          failure = result.kind; error = result.message ?? null; pending = null;
          if (leave !== null) leave.phase = "confirming";
        } else throw new TypeError("Unknown commit result");
        break;
      }
      default: throw new TypeError("Unknown editing intent");
    }
    revision++;
    return { snapshot: snapshot(), effects };
  }
  return { snapshot, dispatch, dispose() { active = false; pending = null; leave = null; revision++; } };
}

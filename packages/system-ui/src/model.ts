import { createEditingSession } from "./editor.js";
import type { EditingEffect, EditingIntent, EditingOptions, EditingSnapshot, EditingTransition } from "./editor.js";

export interface EditingModel<Value> {
  snapshot(): EditingSnapshot<Value>;
  dispatch(intent: EditingIntent<Value>): void;
  /** Observe future transitions. Unsubscribing does not dispose the session or cancel a write. */
  subscribe(listener: (snapshot: EditingSnapshot<Value>) => void): () => void;
  /** End the owning editing visit, rather than an individual presentation connection. */
  dispose(): void;
}
export interface EditingModelOptions<Value> extends EditingOptions<Value> {
  /** The application executes operations/navigation and dispatches their results to this owner. */
  readonly effect: (effect: EditingEffect<Value>) => void;
}

/** One editing owner with replaceable presenters and one application effect executor. */
export function createEditingModel<Value>(options: EditingModelOptions<Value>): EditingModel<Value> {
  if (typeof options.effect !== "function") throw new TypeError("An editing model requires an application effect executor");
  const session = createEditingSession(options);
  const listeners = new Set<(snapshot: EditingSnapshot<Value>) => void>();
  const queue: EditingTransition<Value>[] = [];
  let publishing = false, disposed = false;
  function dispatch(intent: EditingIntent<Value>): void {
    if (disposed) return;
    queue.push(session.dispatch(intent));
    if (publishing) return;
    publishing = true;
    const errors: unknown[] = [];
    try {
      for (let transition = queue.shift(); transition; transition = queue.shift()) {
        const observers = Array.from(listeners);
        for (const listener of observers) {
          if (disposed) break;
          if (!listeners.has(listener)) continue;
          try {
            listener({ ...transition.snapshot, value: options.copy(transition.snapshot.value),
              leave: transition.snapshot.leave === null ? null : { ...transition.snapshot.leave } });
          } catch (error) { errors.push(error); }
        }
        for (const effect of transition.effects) {
          try { options.effect(effect); } catch (error) { errors.push(error); }
        }
      }
    } finally { publishing = false; }
    if (errors.length) throw new AggregateError(errors, "Editing transition delivery failed");
  }
  return {
    snapshot: () => session.snapshot(), dispatch,
    subscribe(listener) {
      if (disposed) throw new Error("Cannot observe a disposed editing model");
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() { if (!disposed) { disposed = true; listeners.clear(); queue.length = 0; session.dispose(); } },
  };
}

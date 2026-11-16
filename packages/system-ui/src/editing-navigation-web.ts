import { pageLeaveEvent } from "@threadlabs/markupkit/navigation";
import type { PageLeaveApproval, PageLeaveRequest } from "@threadlabs/markupkit/navigation";
import type { EditingEffect } from "./editor.js";
import type { EditingModel } from "./model.js";

export interface EditingNavigationBinding<Value> {
  /** Hand a matching navigation effect to the pending MarkupKit page change. */
  approve(effect: EditingEffect<Value>): boolean;
  /** Detach this host connection without cancelling provider writes. */
  dispose(): void;
}

/** Bind the page layer, rather than the editor control or a retained layout. */
export function bindEditingNavigation<Value>(root: Element, model: EditingModel<Value>): EditingNavigationBinding<Value> {
  let pending: { approve(effect: EditingEffect<Value>): boolean; cancel(): void } | undefined;
  let disposed = false;
  const cancelled = () => new DOMException("The editing page remains active", "AbortError");
  const request = (event: Event) => {
    const detail = (event as CustomEvent<PageLeaveRequest>).detail;
    event.preventDefault();
    if (!detail.controllable) return;
    pending?.cancel();
    detail.waitUntil(new Promise<PageLeaveApproval>((resolve, reject) => {
      const sessionId = model.snapshot().sessionId;
      let leaveId: string | undefined, navigationId: string | undefined, active = true;
      let stop = () => {};
      const cleanup = () => {
        active = false; stop(); detail.signal.removeEventListener("abort", cancel);
        if (pending === owner) pending = undefined;
      };
      const cancel = () => {
        if (!active) return;
        cleanup();
        const leave = model.snapshot().leave;
        if (leaveId !== undefined && leave?.id === leaveId) model.dispatch({ type: "choose-leave", sessionId, leaveId, choice: "stay" });
        reject(cancelled());
      };
      const current = () => {
        const snapshot = model.snapshot();
        return active && !detail.signal.aborted && snapshot.active && snapshot.sessionId === sessionId &&
          snapshot.leave?.id === leaveId && snapshot.leave?.navigationId === navigationId && snapshot.leave?.phase === "navigating";
      };
      const owner = {
        cancel,
        approve(effect: EditingEffect<Value>) {
          const leave = model.snapshot().leave;
          if (!active || effect.kind !== "navigate" || leave === null || leave.id !== leaveId || leave.navigationId !== effect.navigationId || effect.destination !== detail.destination) return false;
          navigationId = effect.navigationId;
          resolve({ current, complete(result) {
            if (!active) return;
            const valid = current(); cleanup();
            model.dispatch({ type: "navigation-result", sessionId, navigationId: effect.navigationId, result: valid ? result : "cancelled" });
          } });
          return true;
        },
      };
      pending = owner;
      stop = model.subscribe(snapshot => {
        leaveId ??= snapshot.leave?.destination === detail.destination ? snapshot.leave.id : undefined;
        if (!snapshot.active || snapshot.sessionId !== sessionId || snapshot.leave?.id !== leaveId) cancel();
      });
      detail.signal.addEventListener("abort", cancel, { once: true });
      if (detail.signal.aborted) { cancel(); return; }
      try { model.dispatch({ type: "leave", destination: detail.destination }); }
      catch (error) { cleanup(); reject(error); }
    }));
  };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    const snapshot = model.snapshot();
    if (snapshot.active && (snapshot.dirty || snapshot.pending)) { event.preventDefault(); event.returnValue = ""; }
  };
  root.addEventListener(pageLeaveEvent, request);
  root.ownerDocument.defaultView?.addEventListener("beforeunload", beforeUnload);
  return {
    approve: effect => pending?.approve(effect) ?? false,
    dispose() {
      if (disposed) return;
      disposed = true; pending?.cancel();
      root.removeEventListener(pageLeaveEvent, request);
      root.ownerDocument.defaultView?.removeEventListener("beforeunload", beforeUnload);
    },
  };
}

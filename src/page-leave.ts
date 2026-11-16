/** Shared DOM transport: navigation adapters and the client may be bundled independently. */
export interface PageLeaveApproval {
  current(): boolean;
  complete(result: "committed" | "cancelled"): void;
}
export interface PageLeaveRequest {
  readonly destination: string;
  readonly controllable: boolean;
  readonly signal: AbortSignal;
  waitUntil(approval: Promise<PageLeaveApproval>): void;
}
export const pageLeaveEvent = "mk:before-leave";

export function requestPageLeave(root: Element, destination: string, signal: AbortSignal, controllable: boolean): Promise<PageLeaveApproval> | false | undefined {
  const pending: Promise<PageLeaveApproval>[] = [];
  const cancellation = new AbortController();
  const combined = AbortSignal.any([signal, cancellation.signal]);
  const accepted: PageLeaveApproval[] = [];
  let open = true;
  const event = new CustomEvent<PageLeaveRequest>(pageLeaveEvent, { cancelable: true, detail: {
    destination, controllable, signal: combined,
    waitUntil(approval) {
      if (!open) throw new Error("A page leave response must be registered during event dispatch");
      pending.push(approval.then(value => { accepted.push(value); return value; }));
    },
  } });
  root.dispatchEvent(event);
  open = false;
  if (!pending.length) return event.defaultPrevented ? false : undefined;
  return Promise.all(pending).then(approvals => ({
    current: () => !combined.aborted && approvals.every(approval => approval.current()),
    complete(result) { for (const approval of approvals) approval.complete(result); },
  }), error => {
    cancellation.abort(error);
    for (const approval of accepted) approval.complete("cancelled");
    throw error;
  });
}

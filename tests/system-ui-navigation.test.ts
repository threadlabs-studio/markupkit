import { describe, expect, it } from "vitest";
import { requestPageLeave } from "../src/page-leave.js";
import { bindEditingNavigation } from "../packages/system-ui/src/markupkit.js";
import { createEditingModel } from "../packages/system-ui/src/model.js";
import type { CommitEffect } from "../packages/system-ui/src/editor.js";

function fixture() {
  const root = Object.assign(new EventTarget(), { ownerDocument: { defaultView: new EventTarget() } }) as unknown as Element;
  let binding: ReturnType<typeof bindEditingNavigation<string>>;
  const writes: CommitEffect<string>[] = [];
  const model = createEditingModel({ resource: "record/1", value: "Initial", version: 1, operation: "save", copy: value => value, equal: Object.is,
    effect(effect) { if (effect.kind === "navigate") binding.approve(effect); else writes.push(effect); },
  });
  binding = bindEditingNavigation(root, model);
  const edit = (value: string) => model.dispatch({ type: "edit", sessionId: model.snapshot().sessionId, value });
  const choice = (choice: "save" | "discard" | "stay") => model.dispatch({ type: "choose-leave", sessionId: model.snapshot().sessionId, leaveId: model.snapshot().leave!.id, choice });
  const request = (signal = new AbortController().signal) => requestPageLeave(root, "https://example.test/next/", signal, true) as Promise<import("../src/page-leave.js").PageLeaveApproval>;
  return { root, binding, model, writes, edit, choice, request };
}

describe("editing page departure", () => {
  it("ends a clean editing visit only after the host acknowledges its actual swap", async () => {
    const f = fixture(); const approved = await f.request();
    expect(approved.current()).toBe(true); expect(f.model.snapshot().active).toBe(true);
    approved.complete("committed");
    expect(f.model.snapshot().active).toBe(false);
    f.binding.dispose();
    expect(requestPageLeave(f.root, "https://example.test/next/", new AbortController().signal, true)).toBeUndefined();
  });
  it("rejects Stay and invalidates a discard approval when a newer edit arrives", async () => {
    const f = fixture(); f.edit("Draft");
    const staying = expect(f.request()).rejects.toMatchObject({ name: "AbortError" });
    f.choice("stay"); await staying;
    expect(f.model.snapshot().value).toBe("Draft");
    const leaving = f.request(); f.choice("discard"); const approved = await leaving;
    expect(approved.current()).toBe(true);
    f.edit("Newer draft"); expect(approved.current()).toBe(false);
    approved.complete("committed");
    expect(f.model.snapshot()).toMatchObject({ active: true, value: "Newer draft", leave: null });
    f.binding.dispose();
  });
  it("cancels an aborted departure without claiming to cancel its provider write", async () => {
    const f = fixture(); f.edit("Submitted"); const abort = new AbortController();
    const staying = expect(f.request(abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    f.choice("save"); expect(f.writes).toHaveLength(1);
    abort.abort(); await staying;
    expect(f.model.snapshot()).toMatchObject({ active: true, pending: true, leave: null });
    f.model.dispatch({ type: "commit-result", operationId: f.writes[0]!.operationId, result: { kind: "ok", value: "Submitted", version: 2 } });
    expect(f.model.snapshot()).toMatchObject({ active: true, pending: false, dirty: false });
    f.binding.dispose();
  });
  it("leaves document-only departures to the native warning without opening a second prompt", () => {
    const f = fixture(); f.edit("Draft");
    expect(requestPageLeave(f.root, "https://example.test/next/", new AbortController().signal, false)).toBe(false);
    expect(f.model.snapshot()).toMatchObject({ active: true, value: "Draft", leave: null });
    f.binding.dispose();
  });
  it("cancels already-approved owners when another editor stays", async () => {
    const f = fixture(); const second = createEditingModel({ resource: "record/2", value: "Initial", version: 1, operation: "save", copy: value => value, equal: Object.is, effect() {} });
    const other = bindEditingNavigation(f.root, second);
    second.dispatch({ type: "edit", sessionId: second.snapshot().sessionId, value: "Other draft" });
    const staying = expect(f.request()).rejects.toMatchObject({ name: "AbortError" });
    second.dispatch({ type: "choose-leave", sessionId: second.snapshot().sessionId, leaveId: second.snapshot().leave!.id, choice: "stay" });
    await staying;
    expect(f.model.snapshot()).toMatchObject({ active: true, leave: null });
    expect(second.snapshot()).toMatchObject({ active: true, value: "Other draft", leave: null });
    f.binding.dispose(); other.dispose();
  });
});

import { describe, expect, it } from "vitest";
import { createEditingSession } from "../../src/index.js";

function editor(leave: "confirm" | "discard" = "confirm") {
  return createEditingSession({ resource: "notes/coast", value: { title: "Coast", text: "" }, version: "etag-1", operation: "notes.save", whenDirty: leave,
    copy: (value: { title: string; text: string }) => ({ ...value }), equal: (a, b) => a.title === b.title && a.text === b.text });
}
function edit(model: ReturnType<typeof editor>, text: string) {
  return model.dispatch({ type: "edit", sessionId: model.snapshot().sessionId, value: { title: "Coast", text } });
}
function save(model: ReturnType<typeof editor>) { return model.dispatch({ type: "save", sessionId: model.snapshot().sessionId }); }
function commit(result: ReturnType<ReturnType<typeof editor>["dispatch"]>) {
  const effect = result.effects.find(item => item.kind === "commit");
  if (effect?.kind !== "commit") throw new Error("Expected a commit effect");
  return effect;
}

describe("portable System UI editing", () => {
  it("owns a draft independently of the source and snapshots, with unavailable clean Save", () => {
    const model = editor();
    expect(save(model).effects).toEqual([]);
    const state = edit(model, "Sea air").snapshot;
    state.value.text = "An accidental presenter mutation";
    expect(model.snapshot().value.text).toBe("Sea air");
    expect(model.snapshot()).toMatchObject({ dirty: true, saveEnabled: true, status: "dirty" });
    expect(model.dispatch({ type: "edit", sessionId: "old-visit", value: { title: "Wrong", text: "Wrong" } }).snapshot.value.text).toBe("Sea air");
  });

  it("emits one commit with an opaque provider version and isolates its submitted value", () => {
    const model = editor(); edit(model, "Sea air");
    const effect = commit(save(model));
    expect(effect).toMatchObject({ kind: "commit", operation: "notes.save", resource: "notes/coast", expectedVersion: "etag-1", value: { text: "Sea air" } });
    expect(save(model).effects).toEqual([]);
    if (effect.kind !== "commit") throw new Error("Expected a commit");
    effect.value.text = "Changed by an adapter";
    expect(model.snapshot().value.text).toBe("Sea air");
    expect(model.snapshot()).toMatchObject({ pending: true, saveEnabled: false, status: "saving" });
  });

  it("accepts canonical saved data without erasing edits made during the save", () => {
    const model = editor(); edit(model, "Sea air ");
    const operation = commit(save(model));
    edit(model, "Sea air and a notebook");
    model.dispatch({ type: "commit-result", operationId: operation.operationId, result: { kind: "ok", value: { title: "Coast", text: "Sea air" }, version: "etag-2" } });
    expect(model.snapshot()).toMatchObject({ value: { text: "Sea air and a notebook" }, dirty: true, status: "newer-edits", version: "etag-2" });
    const next = commit(save(model));
    expect(next).toMatchObject({ expectedVersion: "etag-2" });
    model.dispatch({ type: "commit-result", operationId: next.operationId, result: { kind: "ok", value: { title: "Coast", text: "Sea air and a notebook" }, version: "etag-3" } });
    expect(model.snapshot()).toMatchObject({ dirty: false, status: "clean", saveEnabled: false });
  });

  it("keeps, discards, or saves a dirty session before accepting navigation", () => {
    const model = editor(); edit(model, "Keep this");
    expect(model.dispatch({ type: "leave", destination: "/notes/studio/" }).effects).toEqual([]);
    expect(model.snapshot().leave).toMatchObject({ destination: "/notes/studio/", phase: "confirming", discardEnabled: true });
    model.dispatch({ type: "choose-leave", sessionId: model.snapshot().sessionId, leaveId: model.snapshot().leave!.id, choice: "stay" });
    expect(model.snapshot()).toMatchObject({ leave: null, value: { text: "Keep this" } });
    model.dispatch({ type: "leave", destination: "/notes/studio/" });
    expect(model.dispatch({ type: "choose-leave", sessionId: model.snapshot().sessionId, leaveId: model.snapshot().leave!.id, choice: "discard" }).effects).toEqual([expect.objectContaining({ kind: "navigate", destination: "/notes/studio/" })]);
    expect(model.snapshot().active).toBe(true);
    model.dispatch({ type: "navigation-result", sessionId: model.snapshot().sessionId, navigationId: model.snapshot().leave!.navigationId!, result: "committed" });
    expect(model.snapshot().active).toBe(false);
  });

  it("joins a pending save, forbids racing Discard, and navigates only after success", () => {
    const model = editor(); edit(model, "A notebook"); const operation = commit(save(model));
    model.dispatch({ type: "leave", destination: "/" });
    expect(model.snapshot().leave?.discardEnabled).toBe(false);
    expect(model.dispatch({ type: "choose-leave", sessionId: model.snapshot().sessionId, leaveId: model.snapshot().leave!.id, choice: "discard" }).effects).toEqual([]);
    expect(model.dispatch({ type: "choose-leave", sessionId: model.snapshot().sessionId, leaveId: model.snapshot().leave!.id, choice: "save" }).effects).toEqual([]);
    expect(model.snapshot().leave?.phase).toBe("saving");
    expect(model.dispatch({ type: "commit-result", operationId: operation.operationId, result: { kind: "ok", value: { title: "Coast", text: "A notebook" }, version: "etag-2" } }).effects).toEqual([expect.objectContaining({ kind: "navigate", destination: "/" })]);
  });

  it("asks again after newer edits during save-and-leave, and retains failure/conflict drafts", () => {
    const model = editor(); edit(model, "First"); model.dispatch({ type: "leave", destination: "/" });
    const operation = commit(model.dispatch({ type: "choose-leave", sessionId: model.snapshot().sessionId, leaveId: model.snapshot().leave!.id, choice: "save" }));
    edit(model, "Second");
    expect(model.dispatch({ type: "commit-result", operationId: operation.operationId, result: { kind: "ok", value: { title: "Coast", text: "First" }, version: "etag-2" } }).effects).toEqual([]);
    expect(model.snapshot().leave?.phase).toBe("confirming");
    for (const kind of ["error", "conflict"] as const) {
      const pending = commit(model.dispatch({ type: "choose-leave", sessionId: model.snapshot().sessionId, leaveId: model.snapshot().leave!.id, choice: "save" }));
      model.dispatch({ type: "commit-result", operationId: pending.operationId, result: { kind, message: "Try again" } });
      expect(model.snapshot()).toMatchObject({ value: { text: "Second" }, dirty: true, pending: false, status: kind, error: "Try again", leave: { phase: "confirming" } });
    }
  });

  it("honors a discard policy without pretending an in-flight write was canceled", () => {
    const discard = editor("discard"); edit(discard, "Draft");
    expect(discard.dispatch({ type: "leave", destination: "/" }).effects).toEqual([expect.objectContaining({ kind: "navigate", destination: "/" })]);
    const pending = editor("discard"); edit(pending, "Draft"); save(pending);
    expect(pending.dispatch({ type: "leave", destination: "/" }).effects).toEqual([]);
    expect(pending.snapshot().leave?.phase).toBe("confirming");
  });

  it("retains a pending draft after an invalid provider revision and accepts a subsequent valid result", () => {
    const model = editor(); edit(model, "Draft"); const operation = commit(save(model));
    expect(() => model.dispatch({ type: "commit-result", operationId: operation.operationId,
      result: { kind: "ok", value: { title: "Coast", text: "Wrong" }, version: Number.NaN } })).toThrow("version");
    expect(model.snapshot()).toMatchObject({ pending: true, value: { text: "Draft" }, version: "etag-1" });
    model.dispatch({ type: "commit-result", operationId: operation.operationId,
      result: { kind: "ok", value: { title: "Coast", text: "Draft" }, version: "etag-2" } });
    expect(model.snapshot()).toMatchObject({ pending: false, dirty: false, version: "etag-2" });
  });

  it("ignores stale results and disposed session events", () => {
    const model = editor(); edit(model, "Draft"); const operation = commit(save(model));
    expect(model.dispatch({ type: "commit-result", operationId: "another-operation", result: { kind: "error" } }).snapshot.pending).toBe(true);
    model.dispose();
    expect(model.dispatch({ type: "commit-result", operationId: operation.operationId, result: { kind: "ok", value: { title: "Coast", text: "Stale" }, version: "etag-2" } }).effects).toEqual([]);
    expect(model.snapshot()).toMatchObject({ active: false, value: { text: "Draft" } });
    expect(editor().snapshot().sessionId).not.toBe(model.snapshot().sessionId);
  });

  it("retains the same dirty editor when a prepared discard navigation is cancelled", () => {
    const model = editor(); edit(model, "Keep this draft");
    const sessionId = model.snapshot().sessionId;
    model.dispatch({ type: "leave", destination: "/" });
    const proposed = model.dispatch({ type: "choose-leave", sessionId, leaveId: model.snapshot().leave!.id, choice: "discard" });
    const effect = proposed.effects[0]!;
    if (effect.kind !== "navigate") throw new Error("Expected navigation");
    expect(proposed.snapshot).toMatchObject({ active: true, dirty: true, leave: { phase: "navigating" } });
    model.dispatch({ type: "navigation-result", sessionId, navigationId: effect.navigationId, result: "cancelled" });
    expect(model.snapshot()).toMatchObject({ active: true, sessionId, value: { text: "Keep this draft" }, dirty: true, leave: null });
    expect(model.dispatch({ type: "leave", destination: "/" }).snapshot.leave?.phase).toBe("confirming");
  });

  it("rejects a late navigation commit after a newer edit invalidates its authorization", () => {
    const model = editor("discard"); edit(model, "First draft");
    const proposed = model.dispatch({ type: "leave", destination: "/" }).effects[0]!;
    if (proposed.kind !== "navigate") throw new Error("Expected navigation");
    edit(model, "A newer thought");
    model.dispatch({ type: "navigation-result", sessionId: model.snapshot().sessionId, navigationId: proposed.navigationId, result: "committed" });
    expect(model.snapshot()).toMatchObject({ active: true, value: { text: "A newer thought" }, leave: null });
    const replacement = model.dispatch({ type: "leave", destination: "/elsewhere/" }).effects[0]!;
    if (replacement.kind !== "navigate") throw new Error("Expected replacement navigation");
    expect(replacement.navigationId).not.toBe(proposed.navigationId);
    model.dispatch({ type: "navigation-result", sessionId: model.snapshot().sessionId, navigationId: proposed.navigationId, result: "cancelled" });
    expect(model.snapshot().leave?.navigationId).toBe(replacement.navigationId);
  });

  it("keeps an accepted saved baseline when save-and-leave presentation is cancelled", () => {
    const model = editor(); edit(model, "Saved thought");
    model.dispatch({ type: "leave", destination: "/" });
    const operation = commit(model.dispatch({ type: "choose-leave", sessionId: model.snapshot().sessionId, leaveId: model.snapshot().leave!.id, choice: "save" }));
    const proposed = model.dispatch({ type: "commit-result", operationId: operation.operationId, result: { kind: "ok", value: { title: "Coast", text: "Canonical thought" }, version: "etag-2" } }).effects[0]!;
    if (proposed.kind !== "navigate") throw new Error("Expected navigation");
    model.dispatch({ type: "navigation-result", sessionId: model.snapshot().sessionId, navigationId: proposed.navigationId, result: "cancelled" });
    expect(model.snapshot()).toMatchObject({ active: true, dirty: false, version: "etag-2", value: { text: "Canonical thought" }, leave: null });
  });

  it("invalidates prepared navigation when Save starts and validates matching host outcomes", () => {
    const model = editor("discard"); edit(model, "Draft");
    const proposed = model.dispatch({ type: "leave", destination: "/" }).effects[0]!;
    if (proposed.kind !== "navigate") throw new Error("Expected navigation");
    expect(() => model.dispatch({ type: "navigation-result", sessionId: model.snapshot().sessionId, navigationId: proposed.navigationId, result: "invalid" as "committed" })).toThrow("navigation result");
    expect(model.snapshot().leave?.navigationId).toBe(proposed.navigationId);
    save(model);
    model.dispatch({ type: "navigation-result", sessionId: model.snapshot().sessionId, navigationId: proposed.navigationId, result: "committed" });
    expect(model.snapshot()).toMatchObject({ active: true, pending: true, leave: null });
  });
  it("ignores a native confirmation answered after another leave request replaced it", () => {
    const model = editor(); edit(model, "Keep this draft");
    const first = model.dispatch({ type: "leave", destination: "/first/" }).snapshot.leave!;
    const second = model.dispatch({ type: "leave", destination: "/second/" }).snapshot.leave!;
    expect(second.id).not.toBe(first.id);
    const before = model.snapshot();
    for (const choice of ["save", "discard", "stay"] as const) {
      const result = model.dispatch({ type: "choose-leave", sessionId: before.sessionId, leaveId: first.id, choice });
      expect(result.effects).toEqual([]);
      expect(result.snapshot).toEqual(before);
    }
    const accepted = model.dispatch({ type: "choose-leave", sessionId: before.sessionId, leaveId: second.id, choice: "discard" });
    expect(accepted.effects).toEqual([expect.objectContaining({ kind: "navigate", destination: "/second/" })]);
  });

});

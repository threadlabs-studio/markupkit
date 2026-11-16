import { describe, expect, it } from "vitest";
import { createEditingSession } from "../../src/editor.js";
import { textEditorView } from "../../src/text-editor.js";

function editor() { return createEditingSession({ resource: "records/1", value: "Initial", version: 1n, operation: "records.save", copy: value => value, equal: Object.is }); }

describe("System UI text editor presentation", () => {
  it("keeps presentation identity separate from the editing session and serializes no provider version", () => {
    const model = editor(), initial = model.snapshot();
    const first = textEditorView(initial, { id: "primary", label: "Description" });
    const second = textEditorView(initial, { id: "inspector", label: "Description" });
    expect(first.sessionId).toBe(second.sessionId);
    expect(first.field.id).not.toBe(second.field.id);
    expect(first.save.id).toBe(second.save.id);
    expect(first.save.enabled).toBe(false);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(first).not.toHaveProperty("version");
  });

  it("projects pending Save without changing the draft, and keeps later edits after completion", () => {
    const model = editor(), sessionId = model.snapshot().sessionId;
    model.dispatch({ type: "edit", sessionId, value: "Submitted" });
    const started = model.dispatch({ type: "save", sessionId });
    const effect = started.effects[0]!;
    if (effect.kind !== "commit") throw new Error("Expected commit");
    const pending = textEditorView(started.snapshot, { id: "editor", label: "Description" });
    expect(pending.save).toMatchObject({ enabled: false, pending: true });
    model.dispatch({ type: "edit", sessionId, value: "Later" });
    const accepted = model.dispatch({ type: "commit-result", operationId: effect.operationId, result: { kind: "ok", value: "Submitted", version: 2n } });
    const view = textEditorView(accepted.snapshot, { id: "editor", label: "Description" });
    expect(view.value).toBe("Later");
    expect(view.status.kind).toBe("newer-edits");
    expect(view.save.enabled).toBe(true);
    expect(model.snapshot()).toEqual(accepted.snapshot);
  });

  it("projects the dirty-leave choices with distinct stable action identities and pending availability", () => {
    const model = editor(), sessionId = model.snapshot().sessionId;
    model.dispatch({ type: "edit", sessionId, value: "Draft" });
    const leaving = model.dispatch({ type: "leave", destination: "/next/" });
    const view = textEditorView(leaving.snapshot, { id: "editor", label: "Description", copy: { stay: "Continue writing" } });
    expect(view.leave?.stay.label).toBe("Continue writing");
    expect(new Set([view.save.id, view.leave?.save.id, view.leave?.discard.id, view.leave?.stay.id]).size).toBe(4);
    const saving = model.dispatch({ type: "choose-leave", sessionId, leaveId: model.snapshot().leave!.id, choice: "save" });
    expect(textEditorView(saving.snapshot, { id: "editor", label: "Description" }).leave).toMatchObject({ save: { pending: true, enabled: false }, discard: { enabled: false }, stay: { enabled: true } });
    const staying = model.dispatch({ type: "choose-leave", sessionId, leaveId: model.snapshot().leave!.id, choice: "stay" });
    expect(textEditorView(staying.snapshot, { id: "editor", label: "Description" }).leave).toBeUndefined();
    expect(staying.snapshot.pending).toBe(true);
    expect(staying.snapshot.value).toBe("Draft");
  });
});


describe("native input acknowledgments", () => {
  it("echoes accepted input identity even for equal values, and clears it for unmarked input", () => {
    const editor = createEditingSession({ resource: "note", value: "", version: 1, operation: "save", copy: value => value, equal: (a, b) => a === b });
    const sessionId = editor.snapshot().sessionId;
    const project = () => textEditorView(editor.snapshot(), { id: "note", label: "Note" });
    editor.dispatch({ type: "edit", sessionId, value: "a", inputId: "first" });
    expect(project()).toMatchObject({ value: "a", inputId: "first" });
    editor.dispatch({ type: "edit", sessionId, value: "", inputId: "deleted" });
    editor.dispatch({ type: "edit", sessionId, value: "", inputId: "equal" });
    expect(project()).toMatchObject({ value: "", inputId: "equal", inputRevision: 3 });
    editor.dispatch({ type: "edit", sessionId: "stale", value: "stale", inputId: "stale" });
    expect(project()).toMatchObject({ value: "", inputId: "equal", inputRevision: 3 });
    editor.dispatch({ type: "edit", sessionId, value: "a" });
    expect(project().inputRevision).toBe(4);
    const saving = editor.dispatch({ type: "save", sessionId });
    expect(saving.snapshot.inputRevision).toBe(4);
    expect(project().inputId).toBeUndefined();
    expect(project().value).toBe("a");
    expect(() => editor.dispatch({ type: "edit", sessionId, value: "bad", inputId: "" })).toThrow(/input identity/);
    expect(project().value).toBe("a");
  });
});

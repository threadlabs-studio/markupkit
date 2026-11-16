import { describe, expect, it } from "vitest";
import { createNavigationScene } from "../../src/index.js";

const scene = () => createNavigationScene({ destination: "/", copy: (value: string) => value });
function current(model: ReturnType<typeof scene>) { return model.snapshot().entries.at(-1)!; }

describe("portable System UI navigation scenes", () => {
  it("gives separate visits their own identity while retaining earlier entries", () => {
    const model = scene(), root = current(model);
    const first = model.request({ kind: "push", entryId: root.id, destination: "/notes/coast/" })!;
    expect(model.snapshot().entries).toEqual([root]);
    model.complete(first.id, "committed");
    const visit = current(model);
    const second = model.request({ kind: "push", entryId: visit.id, destination: visit.destination })!;
    model.complete(second.id, "committed");
    expect(current(model).destination).toBe(visit.destination);
    expect(current(model).id).not.toBe(visit.id);
    expect(model.snapshot().entries.slice(0, 2)).toEqual([root, visit]);
  });

  it("does not commit a cancelled native back and retains the target entry identity", () => {
    const model = scene(), root = current(model);
    model.complete(model.request({ kind: "push", entryId: root.id, destination: "/detail/" })!.id, "committed");
    const detail = current(model);
    const back = model.request({ kind: "back", entryId: detail.id })!;
    expect(back.target).toEqual(root);
    expect(current(model)).toEqual(detail);
    model.complete(back.id, "cancelled");
    expect(current(model)).toEqual(detail);
    model.complete(model.request({ kind: "back", entryId: detail.id })!.id, "committed");
    expect(model.snapshot().entries).toEqual([root]);
    expect(model.request({ kind: "back", entryId: root.id })).toBeNull();
  });

  it("replaces one entry without changing its retained ancestors", () => {
    const model = scene(), root = current(model);
    model.complete(model.request({ kind: "push", entryId: root.id, destination: "/first/" })!.id, "committed");
    const old = current(model);
    model.complete(model.request({ kind: "replace", entryId: old.id, destination: "/second/" })!.id, "committed");
    expect(model.snapshot().entries).toEqual([root, { id: current(model).id, destination: "/second/" }]);
    expect(current(model).id).not.toBe(old.id);
  });

  it("supersedes pending requests and ignores obsolete entry and completion handles", () => {
    const model = scene(), root = current(model);
    const obsolete = model.request({ kind: "push", entryId: root.id, destination: "/first/" })!;
    const accepted = model.request({ kind: "push", entryId: root.id, destination: "/second/" })!;
    model.complete(obsolete.id, "committed");
    expect(model.snapshot().pending?.id).toBe(accepted.id);
    expect(current(model)).toEqual(root);
    model.complete(accepted.id, "committed");
    const revision = model.snapshot().revision;
    expect(model.request({ kind: "back", entryId: root.id })).toBeNull();
    model.complete(accepted.id, "committed");
    expect(model.snapshot().revision).toBe(revision);
    expect(current(model).destination).toBe("/second/");
  });

  it("isolates mutable destinations and separate scenes without reading platform globals", () => {
    const destination = { route: "/", query: { view: "list" } };
    const model = createNavigationScene({ destination, copy: value => ({ ...value, query: { ...value.query } }) });
    const other = scene();
    destination.query.view = "changed";
    const snapshot = model.snapshot(); snapshot.entries[0]!.destination.query.view = "changed again";
    expect(model.snapshot().entries[0]!.destination.query.view).toBe("list");
    const pending = model.request({ kind: "push", entryId: snapshot.entries[0]!.id, destination })!;
    pending.target.destination.query.view = "presenter mutation";
    expect(model.snapshot().pending?.target.destination.query.view).toBe("changed");
    other.complete(pending.id, "committed");
    expect(other.snapshot().entries).toHaveLength(1);
    expect(model.snapshot().sceneId).not.toBe(other.snapshot().sceneId);
  });

  it("rejects invalid active results without losing the pending request", () => {
    const model = scene();
    const pending = model.request({ kind: "push", entryId: current(model).id, destination: "/detail/" })!;
    expect(() => model.complete(pending.id, "unknown" as "committed")).toThrow("result");
    expect(model.snapshot().pending?.id).toBe(pending.id);
    model.complete(pending.id, "committed");
    expect(current(model).destination).toBe("/detail/");
  });

  it("invalidates pending callbacks at scene disposal", () => {
    const model = scene(), root = current(model);
    const pending = model.request({ kind: "push", entryId: root.id, destination: "/detail/" })!;
    model.dispose(); model.dispose();
    const closed = model.snapshot();
    model.complete(pending.id, "committed");
    expect(model.request({ kind: "push", entryId: root.id, destination: "/other/" })).toBeNull();
    expect(model.snapshot()).toEqual(closed);
    expect(closed).toMatchObject({ active: false, pending: null, entries: [root] });
  });
});

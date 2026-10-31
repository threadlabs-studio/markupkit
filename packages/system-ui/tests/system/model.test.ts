import { describe, expect, it } from "vitest";
import { createEditingModel } from "../../src/model.js";
import type { EditingEffect } from "../../src/editor.js";

function model(effect: (effect: EditingEffect<string>) => void = () => {}) { return createEditingModel({ resource: "records/1", value: "", version: 1, operation: "save", copy: value => value, equal: Object.is, effect }); }

describe("observable editing ownership", () => {
  it("keeps a pending save alive when a presenter detaches and notifies its replacement", () => {
    const effects: EditingEffect<string>[] = [], owner = model(effect => effects.push(effect));
    const sessionId = owner.snapshot().sessionId;
    const first: string[] = [], replacement: string[] = [];
    const stop = owner.subscribe(snapshot => first.push(snapshot.status));
    owner.dispatch({ type: "edit", sessionId, value: "Draft" });
    owner.dispatch({ type: "save", sessionId }); stop();
    owner.subscribe(snapshot => replacement.push(snapshot.status));
    const commit = effects[0]!; if (commit.kind !== "commit") throw new Error("Expected commit");
    owner.dispatch({ type: "commit-result", operationId: commit.operationId, result: { kind: "ok", value: "Draft", version: 2 } });
    expect(first).toEqual(["dirty", "saving"]);
    expect(replacement).toEqual(["clean"]);
    expect(owner.snapshot().sessionId).toBe(sessionId);
    expect(effects).toHaveLength(1);
  });

  it("orders reentrant updates for every presenter and executes each effect once", () => {
    const effects: EditingEffect<string>[] = [], owner = model(effect => effects.push(effect));
    const sessionId = owner.snapshot().sessionId, seen: string[] = [];
    owner.subscribe(snapshot => { if (snapshot.value === "First") owner.dispatch({ type: "edit", sessionId, value: "Second" }); });
    owner.subscribe(snapshot => seen.push(snapshot.value));
    owner.dispatch({ type: "edit", sessionId, value: "First" });
    expect(seen).toEqual(["First", "Second"]);
    owner.dispatch({ type: "save", sessionId }); owner.dispatch({ type: "save", sessionId });
    expect(effects).toHaveLength(1);
  });

  it("does not let a failed presentation prevent another view or a provider effect", () => {
    const effects: EditingEffect<string>[] = [], owner = model(effect => effects.push(effect));
    const sessionId = owner.snapshot().sessionId, seen: string[] = [];
    owner.dispatch({ type: "edit", sessionId, value: "Draft" });
    owner.subscribe(() => { throw new Error("Failed presentation"); });
    owner.subscribe(snapshot => seen.push(snapshot.status));
    expect(() => owner.dispatch({ type: "save", sessionId })).toThrow(AggregateError);
    expect(seen).toEqual(["saving"]); expect(effects).toHaveLength(1);
  });
});

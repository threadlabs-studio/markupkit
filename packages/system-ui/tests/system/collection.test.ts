import { describe, expect, it } from "vitest";
import { collectionView } from "../../src/collection.js";

const items = [{ key: "coast", href: "/notes/coast/", label: "Coast", summary: "Sea air" }, { key: "garden", href: "/notes/garden/", label: "Garden" }];
const options = { id: "notes", label: "Your notes" };

describe("System UI collection presentation", () => {
  it("keeps stable resource keys and destinations while selection follows application state", () => {
    const first = collectionView({ state: "ready", items }, { ...options, currentKey: "coast" });
    expect(first.items).toEqual([{ ...items[0], current: true }, { ...items[1], summary: "", current: false }]);
    const reordered = collectionView({ state: "ready", items: items.toReversed() }, { ...options, currentKey: "coast" });
    expect(reordered.items.find(item => item.key === "coast")).toEqual(first.items[0]);
    expect(collectionView({ state: "ready", items }, options).items.every(item => !item.current)).toBe(true);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    Reflect.set(first.items[0]!, "label", "Presentation copy");
    expect(items[0]!.label).toBe("Coast");
  });
  it("distinguishes pending, empty and failed loads, allowing provider-supplied retained rows", () => {
    expect(collectionView({ state: "pending" }, options)).toMatchObject({ status: "pending", items: [], message: "Loading…" });
    expect(collectionView({ state: "ready", items: [] }, options)).toMatchObject({ status: "empty", items: [], message: "No items yet" });
    expect(collectionView({ state: "error", message: "Offline", items }, options)).toMatchObject({ status: "error", message: "Offline" });
    expect(collectionView({ state: "pending", items }, options).items).toHaveLength(2);
    expect(collectionView({ state: "ready", items }, options)).toMatchObject({ status: "ready", message: "" });
  });
  it("diagnoses invalid projection identity and repeated resource keys instead of merging rows", () => {
    expect(() => collectionView({ state: "ready", items: [items[0]!, items[0]!] }, options)).toThrow(/duplicate.*coast/i);
    expect(() => collectionView({ state: "ready", items }, { ...options, id: "two words" })).toThrow(/id/);
    expect(() => collectionView({ state: "ready", items: [{ ...items[0]!, label: " " }] }, options)).toThrow(/label/);
  });
});

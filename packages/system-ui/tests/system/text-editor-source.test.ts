import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseComponentResource, validate, type TemplateNode } from "@nextwebwg/html-next";

import { createEditingSession } from "../../src/editor.js";
import { textEditorView } from "../../src/text-editor.js";

const url = new URL("../../components/text-editor.html", import.meta.url).href;

describe("System UI text editor source boundary", () => {
  it("accepts actual shared projections with optional native input acknowledgments", async () => {
    const definition = parseComponentResource(await readFile(new URL(url), "utf8"), url).definitions[0]!;
    const session = createEditingSession({ resource: "note", value: "", version: 0, operation: "save", copy: value => value, equal: Object.is });
    const options = { id: "note", label: "Note" };
    const constraint = { type: definition.contract.props.view!.type, required: true };
    expect(validate(textEditorView(session.snapshot(), options), constraint, "value")).toEqual({ valid: true, errors: [] });
    session.dispatch({ type: "edit", sessionId: session.snapshot().sessionId, value: "Native draft", inputId: "native-input-1" });
    const projected = textEditorView(session.snapshot(), options);
    expect(projected.inputId).toBe("native-input-1");
    expect(validate(projected, constraint, "value")).toEqual({ valid: true, errors: [] });
  });
  it("maps Save and Save and leave to Looma's solid primary action", async () => {
    const definition = parseComponentResource(await readFile(new URL(url), "utf8"), url).definitions[0]!;
    const primary: string[] = [];
    function visit(node: TemplateNode): void {
      if (node.kind !== "element") return;
      const attributes = Object.fromEntries(node.attributes.flatMap(attribute => attribute.kind === "literal" ? [[attribute.name, attribute.value]] : []));
      if (node.name === "ui-button" && attributes.slot === "primary") primary.push(`${attributes.variant}:${attributes.tone}`);
      node.children.forEach(visit);
    }
    visit(definition.template);
    expect(primary).toEqual(["solid:accent", "solid:accent"]);
  });
});

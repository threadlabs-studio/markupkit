import { RequestEvent } from "@nextwebwg/html-next/generated-runtime";
import type { WebThemeScope } from "./web.js";
import type { EditingModel } from "./model.js";
import { textEditorView } from "./text-editor.js";
import type { TextEditorIntent, TextEditorView, TextEditorViewOptions } from "./text-editor.js";

const owners = new WeakSet<Element>();

function editingIntent(value: unknown): value is TextEditorIntent {
  if (typeof value !== "object" || !value || !("sessionId" in value) || typeof value.sessionId !== "string" || !("type" in value)) return false;
  if (value.type === "save") return true;
  if (value.type === "edit") return "value" in value && typeof value.value === "string";
  return value.type === "choose-leave" && "leaveId" in value && typeof value.leaveId === "string" && "choice" in value && ["save", "discard", "stay"].includes(value.choice as string);
}

/** Attach this presentation without taking ownership of its session or in-flight operations. */
export function bindTextEditor(root: Element, options: {
  readonly model: EditingModel<string>;
  readonly view: TextEditorViewOptions;
  readonly theme?: WebThemeScope;
  readonly render: (view: TextEditorView) => void;
}): () => void {
  if (owners.has(root)) throw new Error("This editor presentation already has a model binding");
  if (typeof options.render !== "function") throw new TypeError("An editor binding requires a view renderer");
  const view = () => ({ ...options.view, ...(options.theme === undefined ? {} : { theme: options.theme.snapshot() }) });
  const render = () => { options.render(textEditorView(options.model.snapshot(), view())); };
  render();
  const stop = options.model.subscribe(snapshot => { options.render(textEditorView(snapshot, view())); });
  const stopTheme = options.theme?.subscribe(render);
  const respond = RequestEvent.respond<unknown, boolean>(root, "editing", intent => {
    if (!editingIntent(intent)) return false;
    const snapshot = options.model.snapshot();
    if (!snapshot.active || intent.sessionId !== snapshot.sessionId || intent.type === "choose-leave" && intent.leaveId !== snapshot.leave?.id) return false;
    options.model.dispatch(intent);
    return true;
  });
  owners.add(root);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true; respond(); stop(); stopTheme?.(); owners.delete(root);
  };
}

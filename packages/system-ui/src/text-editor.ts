import type { ResolvedSystemTheme } from "./theme.js";
import type { EditingIntent, EditingSnapshot } from "./editor.js";

export type TextEditorIntent = Extract<EditingIntent<string>, { readonly type: "edit" | "save" | "choose-leave" }>;
export interface EditorActionView {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly pending: boolean;
}
export interface TextEditorCopy {
  readonly save: string;
  readonly leaveTitle: string;
  readonly leaveMessage: string;
  readonly saveAndLeave: string;
  readonly discard: string;
  readonly stay: string;
  readonly status: Readonly<Record<EditingSnapshot<string>["status"], string>>;
}
export interface TextEditorViewOptions {
  /** Stable presentation identity, unique among editor placements in a document or native scene. */
  readonly id: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly theme?: Pick<ResolvedSystemTheme, "shape" | "spacing" | "typography">;
  readonly copy?: Partial<Omit<TextEditorCopy, "status">> & { readonly status?: Partial<TextEditorCopy["status"]> };
}
export interface TextEditorView {
  readonly inputId?: string;
  readonly inputRevision: number;
  readonly schema: "markupkit.text-editor.v1";
  readonly id: string;
  readonly revision: number;
  readonly sessionId: string;
  readonly active: boolean;
  readonly appearance: { readonly action: "system" | "round"; readonly spacing: "system" | "compact" | "comfortable"; readonly typography: "system" | "serif" };
  readonly value: string;
  readonly field: { readonly id: string; readonly label: string; readonly placeholder: string };
  readonly status: { readonly kind: EditingSnapshot<string>["status"]; readonly text: string };
  readonly save: EditorActionView;
  readonly leave?: {
    readonly id: string;
    readonly phase: "confirming" | "saving";
    readonly title: string;
    readonly message: string;
    readonly save: EditorActionView;
    readonly discard: EditorActionView;
    readonly stay: EditorActionView;
  };
}

const defaults: TextEditorCopy = {
  save: "Save", leaveTitle: "Save your changes?", leaveMessage: "Your changes have not been saved.",
  saveAndLeave: "Save and leave", discard: "Discard changes", stay: "Keep editing",
  status: { clean: "All changes saved", dirty: "Unsaved changes", saving: "Saving changes…",
    "newer-edits": "Earlier changes saved; newer edits are unsaved", error: "Could not save. Try again.", conflict: "This record changed. Review your changes before saving again." },
};

/** A serializable presentation of an existing session; creates no session, operation or storage. */
export function textEditorView(snapshot: EditingSnapshot<string>, options: TextEditorViewOptions): TextEditorView {
  if (typeof options.id !== "string" || !options.id || /\s/.test(options.id)) throw new TypeError("An editor placement needs a nonempty id without whitespace");
  if (typeof options.label !== "string" || !options.label.trim()) throw new TypeError("An editor field needs an accessible label");
  if (typeof snapshot.value !== "string") throw new TypeError("The text editor supports string values");
  const copy = { ...defaults, ...options.copy, status: { ...defaults.status, ...options.copy?.status } };
  const action = (name: string, label: string, enabled: boolean, pending = false): EditorActionView => ({ id: `${snapshot.sessionId}/${name}`, label, enabled: snapshot.active && enabled, pending });
  return {
    schema: "markupkit.text-editor.v1", id: options.id, inputRevision: snapshot.inputRevision, ...(snapshot.inputId === undefined ? {} : { inputId: snapshot.inputId }), revision: snapshot.revision, sessionId: snapshot.sessionId,
    active: snapshot.active, value: snapshot.value,
    appearance: { action: options.theme?.shape.action ?? "system", spacing: options.theme?.spacing ?? "system", typography: options.theme?.typography ?? "system" },
    field: { id: `${options.id}-value`, label: options.label, placeholder: options.placeholder ?? "" },
    status: { kind: snapshot.status, text: snapshot.error ?? copy.status[snapshot.status] },
    save: action("save", copy.save, snapshot.saveEnabled, snapshot.pending),
    ...(snapshot.active && snapshot.leave && snapshot.leave.phase !== "navigating" ? { leave: {
      id: snapshot.leave.id, phase: snapshot.leave.phase, title: copy.leaveTitle, message: copy.leaveMessage,
      save: action("leave-save", copy.saveAndLeave, !snapshot.pending, snapshot.pending),
      discard: action("leave-discard", copy.discard, snapshot.leave.discardEnabled),
      stay: action("leave-stay", copy.stay, true),
    } } : {}),
  };
}

import type { ResolvedSystemTheme } from "./theme.js";

export interface CollectionItem {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  readonly summary?: string;
}
/** Providers may explicitly retain rows during refresh/failure; the projection owns no cache. */
export type CollectionSource =
  | { readonly state: "ready"; readonly items: readonly CollectionItem[] }
  | { readonly state: "pending"; readonly items?: readonly CollectionItem[] }
  | { readonly state: "error"; readonly message: string; readonly items?: readonly CollectionItem[] };
export interface CollectionViewOptions {
  readonly id: string;
  readonly label: string;
  /** A resource key from the committed destination, independent of keyboard focus. */
  readonly currentKey?: string | null;
  readonly loadingMessage?: string;
  readonly emptyMessage?: string;
  readonly theme?: Pick<ResolvedSystemTheme, "spacing" | "typography">;
}
export interface CollectionView {
  readonly schema: "markupkit.collection.v1";
  readonly id: string;
  readonly label: string;
  readonly status: "pending" | "ready" | "empty" | "error";
  readonly message: string;
  readonly appearance: { readonly spacing: "system" | "compact" | "comfortable"; readonly typography: "system" | "serif" };
  readonly items: readonly { readonly key: string; readonly href: string; readonly label: string; readonly summary: string; readonly current: boolean }[];
}

/** Project provider-owned results and committed selection without loading or navigating. */
export function collectionView(source: CollectionSource, options: CollectionViewOptions): CollectionView {
  const text = (value: string, field: string) => {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`A collection requires a nonempty ${field}`);
    return value;
  };
  text(options.id, "id");
  if (/\s/.test(options.id)) throw new TypeError("A collection id cannot contain whitespace");
  text(options.label, "label");
  if (!["ready", "pending", "error"].includes(source.state)) throw new TypeError("Unknown collection source state");
  const supplied = source.items ?? (source.state === "ready" ? undefined : []);
  if (!Array.isArray(supplied)) throw new TypeError("A ready collection requires an items array");
  const keys = new Set<string>();
  const items = supplied.map(item => {
    text(item.key, "resource key"); text(item.href, "destination href"); text(item.label, "item label");
    if (keys.has(item.key)) throw new TypeError(`Duplicate collection resource key: ${item.key}`);
    keys.add(item.key);
    if (item.summary !== undefined && typeof item.summary !== "string") throw new TypeError("A collection summary must be text");
    return { key: item.key, href: item.href, label: item.label, summary: item.summary ?? "", current: item.key === options.currentKey };
  });
  const status = source.state === "ready" && items.length === 0 ? "empty" : source.state;
  const message = status === "pending" ? options.loadingMessage ?? "Loading…" : status === "empty" ? options.emptyMessage ?? "No items yet" : source.state === "error" ? text(source.message, "error message") : "";
  return { schema: "markupkit.collection.v1", id: options.id, label: options.label, status, message, items,
    appearance: { spacing: options.theme?.spacing ?? "system", typography: options.theme?.typography ?? "system" } };
}

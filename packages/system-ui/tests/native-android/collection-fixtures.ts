import { collectionView } from "../../src/collection.js";

const items = [
  { key: "coast", href: "/notes/coast/", label: "Coast", summary: "A coastal walk" },
  { key: "garden", href: "/notes/garden/", label: "Garden", summary: "" },
];
const options = { id: "notes", label: "Notes", currentKey: "coast" };
process.stdout.write(JSON.stringify({
  ready: collectionView({ state: "ready", items }, options),
  reordered: collectionView({ state: "ready", items: items.toReversed() }, { ...options, currentKey: "garden", theme: { spacing: "comfortable", typography: "serif" } }),
  pending: collectionView({ state: "pending", items }, options),
  error: collectionView({ state: "error", message: "Offline; notes remain available", items }, options),
  empty: collectionView({ state: "ready", items: [] }, options),
}) + "\n");

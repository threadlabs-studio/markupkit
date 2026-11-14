import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectionView } from "../src/collection.js";

if (process.platform !== "darwin") throw new Error("Native System UI checks require macOS with Xcode and the iPhone Simulator SDK");
const root = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, "native/SystemTextEditor.swift");
const collection = join(root, "native/SystemCollection.swift");
const composition = join(root, "native/SystemCollectionDetail.swift");
const navigation = join(root, "native/SystemPageNavigation.swift");
const output = mkdtempSync(join(tmpdir(), "markupkit-native-check-"));
const run = (command: string, args: readonly string[]) => execFileSync(command, args, { stdio: "inherit" });
try {
  const test = join(output, "native-dialog-tests");
  run("xcrun", ["swiftc", "-parse-as-library", source, join(root, "tests/system/native-dialog.swift"), "-o", test]);
  run(test, []);
  const items = [{ key: "coast", href: "/notes/coast/", label: "Coast", summary: "Sea air" }, { key: "garden", href: "/notes/garden/", label: "Garden" }];
  const options = { id: "notes", label: "Notes", currentKey: "coast", theme: { spacing: "comfortable", typography: "serif" } } as const;
  const fixture = join(output, "collection.json");
  writeFileSync(fixture, JSON.stringify([
    collectionView({ state: "ready", items }, options), collectionView({ state: "pending", items }, options),
    collectionView({ state: "ready", items: [] }, options), collectionView({ state: "error", message: "Offline" }, options),
  ]));
  const collectionTest = join(output, "native-collection-tests");
  run("xcrun", ["swiftc", "-parse-as-library", collection, join(root, "tests/system/native-collection.swift"), "-o", collectionTest]);
  run(collectionTest, [fixture]);
  const sdk = execFileSync("xcrun", ["--sdk", "iphonesimulator", "--show-sdk-path"], { encoding: "utf8" }).trim();
  run("xcrun", ["swiftc", "-parse-as-library", "-emit-module", "-module-name", "MarkupKitSystemUI", "-target", "arm64-apple-ios17.0-simulator", "-sdk", sdk, source, collection, composition, navigation, "-emit-module-path", join(output, "MarkupKitSystemUI.swiftmodule")]);
  const macSdk = execFileSync("xcrun", ["--sdk", "macosx", "--show-sdk-path"], { encoding: "utf8" }).trim();
  run("xcrun", ["swiftc", "-parse-as-library", "-emit-module", "-module-name", "MarkupKitSystemUIMac", "-target", "arm64-apple-macos14.0", "-sdk", macSdk, source, collection, composition, "-emit-module-path", join(output, "MarkupKitSystemUIMac.swiftmodule")]);
  process.stdout.write("Native System UI lifecycle checks and iOS Simulator source compilation passed. Interactive platform checks remain separate.\n");
} finally { rmSync(output, { recursive: true, force: true }); }

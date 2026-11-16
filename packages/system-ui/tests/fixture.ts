import { fileURLToPath } from "node:url";
import { mkdir, writeFile, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function write(root: string, file: string, contents: string): Promise<void> {
  const path = join(root, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

/** Install the owning workspace packages and registry-tested runtime into an app fixture. */
export async function installPackages(root: string): Promise<void> {
  for (const [name, directory] of [
    ["@threadlabs/markupkit", fileURLToPath(new URL("../../../", import.meta.url))],
    ["@threadlabs/system-ui", fileURLToPath(new URL("../", import.meta.url))],
    ...["@nextwebwg/html-next", "@threadlabs/looma"].map(name => [name, dirname(dirname(fileURLToPath(import.meta.resolve(name))))]),
  ] as const) {
    const target = join(root, "node_modules", name!);
    await mkdir(dirname(target), { recursive: true });
    await symlink(directory!, target, "dir");
  }
}

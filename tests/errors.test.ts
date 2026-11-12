import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, expect, it } from "vitest";

import { write } from "./fixture.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

async function brokenApp(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "markupkit-errors-")); roots.push(root);
  await write(root, "app/pages/loader.html", '<template component="loader-page"><defs><prop name="title" type="string" required>Title</prop></defs><main><h1>{$title}</h1></main></template>');
  await write(root, "app/pages/loader.server.ts", "export const load = () => {\n  const data = undefined as any;\n  return { props: { title: data.title } };\n};\n");
  return root;
}

// The CLI runs in plain Node, whose source maps the module runner uses; Vitest replaces Error.prepareStackTrace.
it("shows the failing file, line, and source on the development error page", async () => {
  const root = await brokenApp();
  const dev = spawn(process.execPath, [cli, "dev", root, "--port", "0"]);
  let stderr = "";
  dev.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  try {
    const [url] = await new Promise<string[]>((found, failed) => {
      let stdout = "";
      dev.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; const match = /MarkupKit dev: (\S+)/.exec(stdout); if (match) found([match[1]!]); });
      dev.once("exit", () => failed(new Error(stderr)));
    });
    const loader = await fetch(url + "loader/");
    expect(loader.status).toBe(500);
    const page = await loader.text();
    expect(page).toContain("<code>app/pages/loader.server.ts:3:33</code>");
    expect(page).toContain("&gt; 3 |   return { props: { title: data.title } };");
    expect(page).not.toContain("stacktrace");
    expect(stderr).toContain("app/pages/loader.server.ts:3:33 TypeError: Cannot read properties of undefined");
    await write(root, "app/pages/template.html", '<template component="template-page"><defs></defs><main>\n<h1>{$missing}</h1></main></template>');
    await expect.poll(async () => await (await fetch(url + "template/")).text(), { timeout: 10_000 }).toContain("<code>app/pages/template.html:2:1</code>");
  } finally { dev.kill(); }
}, 60_000);

it("names the failing source line when a build fails", async () => {
  const root = await brokenApp();
  const failure = await promisify(execFile)(process.execPath, [cli, "build", root]).then(() => undefined, (error: { stderr: string }) => error);
  expect(failure?.stderr).toContain("Cannot read properties of undefined (reading 'title')\n  at app/pages/loader.server.ts:3:33");
}, 60_000);

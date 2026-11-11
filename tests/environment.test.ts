import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { write } from "./fixture.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("loads .env files for the server and gives browser code only PUBLIC_ variables", async () => {
  const root = await mkdtemp(join(tmpdir(), "markupkit-env-")); roots.push(root);
  await write(root, "package.json", '{"type":"module"}');
  await write(root, ".env", "SECRET=s3cret-value\nPUBLIC_GREETING=from-env\nCHOSEN=from-env\n");
  await write(root, ".env.local", "CHOSEN=from-local\n");
  await write(root, ".env.production", "PUBLIC_GREETING=from-production\n");
  await write(root, ".env.development", "PUBLIC_GREETING=from-development\n");
  await write(root, "app/pages/index.html", `<template component="home-page" module="./home.js"><defs><title>Home</title>
    <prop name="secret" type="string">Secret</prop><prop name="chosen" type="string">Chosen</prop><prop name="shell" type="string">Shell</prop></defs>
    <main><p id="secret">{$secret}</p><p id="chosen">{$chosen}</p><p id="shell">{$shell}</p></main></template>`);
  await write(root, "app/pages/index.server.ts", `export const load = () => ({ props: {
    secret: process.env.SECRET === "s3cret-value" ? "server read it" : "missing", chosen: process.env.CHOSEN, shell: process.env.SHELL_WINS } });`);
  await write(root, "app/pages/home.js", "export function connect(host) { host.root.dataset.greeting = import.meta.env.PUBLIC_GREETING; }");
  await write(root, ".env.production.local", "SHELL_WINS=from-file\n");
  execFileSync(process.execPath, [cli, "build", root], { env: { ...process.env, SHELL_WINS: "from-shell" } });
  const html = await readFile(join(root, "dist/index.html"), "utf8");
  expect(html).toContain('<p id="secret">server read it</p>');
  expect(html).toContain('<p id="chosen">from-local</p>');
  expect(html).toContain('<p id="shell">from-shell</p>');
  const scripts = await Promise.all((await readdir(join(root, "dist/_markupkit"))).filter(file => file.endsWith(".js"))
    .map(file => readFile(join(root, "dist/_markupkit", file), "utf8")));
  expect(scripts.some(script => script.includes("from-production"))).toBe(true);
  expect(scripts.join("\n")).not.toMatch(/s3cret-value|from-development|from-env/);
}, 120_000);

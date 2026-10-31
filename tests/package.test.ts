import { execFileSync, spawn } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const repositoryLicense = readFileSync(join(root, "LICENSE"), "utf8");
const workspace = mkdtempSync(join(tmpdir(), "markupkit-package-consumer-"));
const useCommandShell = process.platform === "win32";
const componentsPackage = "@nextwebwg/html-next";
afterAll(() => rmSync(workspace, { recursive: true, force: true }), 60_000);
function pack(): string {
  const output = execFileSync("corepack", ["pnpm", "pack", "--pack-destination", workspace],
    { cwd: root, encoding: "utf8", shell: useCommandShell }).trim().split("\n").at(-1)!;
  return isAbsolute(output) ? output : join(workspace, output);
}
function runBin(consumer: string, name: string, args: readonly string[] = []): string {
  const bin = join(consumer, "node_modules/.bin", useCommandShell ? `${name}.cmd` : name);
  if (!useCommandShell) expect(lstatSync(bin).isSymbolicLink()).toBe(true);
  return execFileSync(bin, args, { cwd: consumer, encoding: "utf8", shell: useCommandShell });
}

describe("standalone package contract", () => {
  it("builds an application and serves it through the installed MarkupKit CLI", async () => {
    const consumer = join(workspace, "markupkit-consumer");
    mkdirSync(join(consumer, "app/pages"), { recursive: true });
    mkdirSync(join(consumer, "app/layouts"), { recursive: true });
    mkdirSync(join(consumer, "app/components"), { recursive: true });
    writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "markupkit-consumer", private: true, type: "module" }));
    execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", pack()], { cwd: consumer, shell: useCommandShell });
    writeFileSync(join(consumer, "markupkit.config.ts"), 'import { defineConfig, type MarkupKitPlugin, type PageSource } from "@threadlabs/markupkit"; const notes: MarkupKitPlugin = { name: "notes", pages: { extensions: [".note"], compile(_source, page) { const sources: readonly PageSource[] = page.pages; return `<template component="packed-note-${page.scope ?? "base"}"><main data-scope="${page.scope ?? "base"}">${sources.map(source => source.href).join(",")}</main></template>`; } } }; export default defineConfig({ base: "/packed/", plugins: [notes], pages: [{ dir: "app/pages" }, { dir: "notes", prefix: "/en/", scope: "en", include: async file => !file.endsWith("private.note") }, { dir: "notes", prefix: "/fr/", scope: "fr", alias: true, include: file => !file.endsWith("private.note") }] });');
    writeFileSync(join(consumer, "app/layouts/default.html"), '<link rel="component" href="@threadlabs/markupkit/components/nav.html"><template component="packed-shell"><defs><prop name="navigation" type="list(object({ href: string, label: string, current: string, depth: number, pageName: string }))" required>Links</prop><title>Layout default</title></defs><main><mk-nav from:items="$navigation"></mk-nav><slot name="page"></slot></main></template>');
    writeFileSync(join(consumer, "app/layouts/default.server.ts"), 'export const load = async ({ navigation }) => ({ props: { navigation: await navigation() } });');
    writeFileSync(join(consumer, "app/pages/01.index.html"), '<meta name="mk:page" content="packed-page"><template component="packed-label"><strong>Packaged helper</strong></template><template component="packed-page"><defs><prop name="label" type="string" required>Label</prop><title>{$label}</title><link rel="alternate" hreflang="ar" href="https://docs.example/packed/"><link rel="alternate" hreflang="x-default" href="https://docs.example/packed/"></defs><section><h1 $value="$label"></h1><packed-label></packed-label></section></template>');
    writeFileSync(join(consumer, "app/pages/01.index.server.ts"), 'export const load = () => ({ props: { label: "Installed platform" }, head: { lang: "ar", dir: "rtl" } });');
    writeFileSync(join(consumer, "app/components/prepared.html"), '<template component="packed-prepared" module="./prepared.js"><defs><prop name="label" type="string">Prepared value.</prop></defs><aside><p $await="$label">{$label}</p><p $else>Waiting.</p></aside></template>');
    writeFileSync(join(consumer, "app/components/prepared.js"), `import { bindModule } from '@nextwebwg/html-next/bindings';
      const instances = new WeakMap();
      const binding = (host, source) => {
        if (!instances.has(host.props)) instances.set(host.props, bindModule({ props: { label: { input: () => null, load: () => 'Packed prepared value' } } }, { browser: { source } }));
        return instances.get(host.props);
      };
      export const connect = (host, context) => binding(host).connect(host, context);
      export const prepare = (host, context) => binding(host).prepare(host, context);
      export const adopt = (host, context) => binding(host, context.snapshot.source).adopt(host, context);`);
    const pagePath = join(consumer, "app/pages/01.index.html");
    writeFileSync(pagePath, '<link rel="component" href="../components/prepared.html">' + readFileSync(pagePath, "utf8").replace("<section>", "<section><packed-prepared></packed-prepared>"));
    writeFileSync(join(consumer, "app/pages/catalog.note"), "Catalog sources");
    mkdirSync(join(consumer, "notes"));
    writeFileSync(join(consumer, "notes/index.note"), "Scoped source");
    writeFileSync(join(consumer, "notes/private.note"), "Excluded source");
    const installed = join(consumer, "node_modules/@threadlabs/markupkit");
    const output = runBin(consumer, "markupkit", ["build"]);
    expect(output).toContain("Generated 4 pages");
    const html = readFileSync(join(consumer, "dist/index.html"), "utf8");
    expect(html).toContain("Installed platform");
    expect(html).toContain(">Packed prepared value</p>");
    expect(html).toContain('hreflang="ar" href="https://docs.example/packed/"');
    expect(html).toContain('hreflang="x-default" href="https://docs.example/packed/"');
    expect(readFileSync(join(consumer, "dist/catalog/index.html"), "utf8")).toContain("/packed/catalog/");
    expect(readFileSync(join(consumer, "dist/en/index.html"), "utf8")).toContain('data-scope="en"');
    expect(readFileSync(join(consumer, "dist/fr/index.html"), "utf8")).toContain('data-scope="fr"');
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain(">Installed platform</title>");
    expect(html).toMatch(/<main\b[^>]*\s(?:component|data-component)="packed-shell"/);
    expect(html).toContain("Packaged helper");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/packed/"');
    expect(html).toContain('src="/packed/_markupkit/');
    expect(JSON.parse(readFileSync(join(installed, "package.json"), "utf8")).dependencies[componentsPackage]).not.toContain("workspace:");
    expect(readFileSync(join(installed, "LICENSE"), "utf8")).toBe(repositoryLicense);
    const entry = join(consumer, "platform-types.ts");
    writeFileSync(entry, 'import { defineConfig, type Application, type ComponentBindingModule, type EndpointHandler, type LoadContext, type LoaderResult, type Middleware, type RouteInput, type ServerReader, type ServerReaders, type ServerReadContext } from "@threadlabs/markupkit"; import type { ServerApplication } from "@threadlabs/markupkit/server"; export const config = defineConfig({ routes: [] satisfies RouteInput[] }); export const localized = { head: { lang: "ar", dir: "rtl" } } satisfies LoaderResult; export const reader = { load: (id, context) => context.phase === "build" ? id : context.cookies.get("user") ?? id } satisfies ServerReader<string, string>; export type PublicTypes = [Application, ComponentBindingModule, LoadContext, LoaderResult, EndpointHandler, Middleware, ServerApplication, ServerReaders, ServerReadContext];');
    execFileSync("corepack", ["pnpm", "exec", "tsc", "--ignoreConfig", "--noEmit", "--strict", "--skipLibCheck", "--target", "ES2023", "--module", "NodeNext", "--moduleResolution", "NodeNext", entry, join(consumer, "markupkit.config.ts")], { cwd: root, shell: useCommandShell });

    // The built server runs on Node from the installed packages; a resolve hook fails if anything loads Vite.
    writeFileSync(join(consumer, "app/pages/account.html"), '<template component="packed-account"><defs><prop name="user" type="string" required>User</prop><meta name="mk:render" content="server"></defs><p>Hello {$user}</p></template>');
    writeFileSync(join(consumer, "app/pages/account.server.ts"), 'export const load = ({ cookies }) => ({ props: { user: cookies.get("user") ?? "guest" } });');
    mkdirSync(join(consumer, "app/api"));
    writeFileSync(join(consumer, "app/api/time.server.ts"), 'export const GET = () => Response.json({ ok: true });');
    writeFileSync(join(consumer, "no-vite.mjs"), 'import { registerHooks } from "node:module"; registerHooks({ resolve(specifier, context, next) { if (/^vite(?:\\/|$)/.test(specifier)) throw new Error(`start loaded ${specifier}`); return next(specifier, context); } });');
    expect(runBin(consumer, "markupkit", ["build"])).toContain("Generated 4 pages");
    const start = spawn(process.execPath, ["--import", "./no-vite.mjs", join(installed, "dist/cli.js"), "start", "--port", "0"], { cwd: consumer });
    try {
      const url = await new Promise<string>((done, reject) => {
        let output = "";
        start.stdout.on("data", (chunk: Buffer) => { output += chunk; const match = /MarkupKit start: (\S+)/.exec(output); if (match) done(match[1]!); });
        start.stderr.on("data", (chunk: Buffer) => { output += chunk; });
        start.once("exit", code => reject(new Error(`markupkit start exited (${code}): ${output}`)));
      });
      expect(url).toMatch(/\/packed\/$/);
      expect(await (await fetch(`${url}account/`, { headers: { cookie: "user=ada" } })).text()).toContain("Hello ada");
      expect(await (await fetch(`${url}api/time`)).json()).toEqual({ ok: true });
      expect(await (await fetch(url)).text()).toContain("Installed platform");
    } finally { start.kill(); }
  }, 180_000);
});

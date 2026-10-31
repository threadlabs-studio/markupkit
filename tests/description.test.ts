import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { describeApplication } from "../src/description.js";


const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "markupkit-description-")); temporary.push(root);
  await mkdir(join(root, "app/pages/notes"), { recursive: true });
  await mkdir(join(root, "app/layouts"), { recursive: true });
  await writeFile(join(root, "app/layouts/default.html"), '<template component="app-shell"><main><slot name="page"></slot></main></template>');
  await writeFile(join(root, "app/pages/index.html"), '<template component="home-page"><main>Home</main></template>');
  return root;
}

describe("application descriptions for independent build targets", () => {
  it("describes each scoped compilation without compiling an extra unscoped copy", async () => {
    const root = await fixture(), compiled: (string | undefined)[] = [];
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "docs/index.note"), "Scoped note");
    await writeFile(join(root, "docs/plain.html"), '<template component="plain-page"><p>Shared HTML</p></template>');
    const app = await describeApplication({ root, pages: [
      { dir: "docs", prefix: "/en/", scope: "en" }, { dir: "docs", prefix: "/fr/", scope: "fr", alias: true },
    ], plugins: [{ name: "notes", pages: { extensions: [".note"], compile(source, page) {
      compiled.push(page.scope);
      return `<template component="note-${page.scope}"><p>${source}</p></template>`;
    } } }] });
    expect(compiled.sort()).toEqual(["en", "fr"]);
    expect(app.sources.filter(source => source.file.endsWith("index.note")).map(source => [source.scope, source.tag]).sort()).toEqual([["en", "note-en"], ["fr", "note-fr"]]);
    expect(app.sources.filter(source => source.file.endsWith("plain.html"))).toHaveLength(1);
    expect(app.routes.find(route => route.pattern === "/fr/")).toMatchObject({ scope: "fr", pageName: "note-fr", aliasOf: "/en/" });
  });
  it("describes explicit page/layout modules and server capabilities without executing either", async () => {
    const root = await fixture();
    await writeFile(join(root, "app/pages/index.html"), '<template component="home-page" controller="./home.ts"><defs><meta name="mk:alias" content="/start/"></defs><main>Home</main></template>');
    await writeFile(join(root, "app/layouts/default.html"), '<template component="app-shell" controller="./shell.ts"><main><slot name="page"></slot></main></template>');
    for (const file of ["app/pages/index.server.ts", "app/layouts/default.server.ts"]) await writeFile(join(root, file), 'throw new Error("Module executed during description"); export const load = () => ({}); export const connect = () => {}; export const other = 1;');
    const app = await describeApplication({ root, base: "/app/", redirects: { "/old/": "/start/" } });
    expect(app).toMatchObject({ version: 1, root, base: "/app/", redirects: { "/app/old/": "/app/start/" }, routes: [
      { pattern: "/", pageName: "home-page", server: { kind: "file", file: join(root, "app/pages/index.server.ts") }, layouts: [{ server: { kind: "file", file: join(root, "app/layouts/default.server.ts") } }] },
      { pattern: "/start/", canonical: "/" },
    ] });
    expect(JSON.parse(JSON.stringify(app))).toEqual(app);
  });

  it("uses configured plugin sources and nested layout discovery, then binds the retained snapshot", async () => {
    const root = await fixture(); let compiled = 0;
    const image = join(root, "coast.txt"); await writeFile(image, "A coastal asset");
    await writeFile(join(root, "app/pages/notes/_layout.html"), '<template component="notes-shell"><section><slot name="page"></slot></section></template>');
    await writeFile(join(root, "app/pages/notes/coast.note"), "Coast");
    await writeFile(join(root, "markupkit.config.ts"), 'throw new Error("Description must not implicitly execute configuration");');
    const app = await describeApplication({ root, plugins: [{ name: "notes", pages: { extensions: [".note"], compile(source, page) { compiled++; const href = page.asset(image); return `<template component="coast-page"><main>${source}<a href="${href}">Asset</a></main></template>`; } } }] });
    expect(compiled).toBe(1);
    expect(app.routes.find(route => route.pattern === "/notes/coast/")?.layouts.map(layer => layer.component)).toEqual([join(root, "app/layouts/default.html"), join(root, "app/pages/notes/_layout.html")]);
    const retained = app.sources.find(source => source.tag === "coast-page")!;
    expect(retained.source).toContain("<main>Coast");
    expect(Object.values(app.assets)).toEqual([await realpath(image)]);
    expect(retained.source).toContain(Object.keys(app.assets)[0]);
    await rm(join(root, "app/pages/notes/coast.note"));
    expect(compiled).toBe(1);
  });

  it("retains special routes, middleware, endpoints and inline server ownership as inspectable data", async () => {
    const root = await fixture();
    await mkdir(join(root, "app/api"));
    await writeFile(join(root, "app/api/health.server.ts"), 'throw new Error("Endpoint executed");');
    await writeFile(join(root, "app/middleware.server.ts"), 'throw new Error("Middleware executed");');
    await writeFile(join(root, "app/pages/404.html"), '<template component="missing-page"><main>Missing</main></template>');
    const app = await describeApplication({ root, routes: [{ pattern: "/inline/", component: "app/pages/index.html", server: { load() { throw new Error("Inline loader executed"); } } }] });
    expect(app.routes.find(route => route.pattern === "/inline/")?.server).toEqual({ kind: "inline" });
    expect(app.notFound?.pageName).toBe("missing-page");
    expect(app.middleware).toBe(join(root, "app/middleware.server.ts"));
    expect(app.endpoints[0]).toMatchObject({ pattern: "/api/health", file: join(root, "app/api/health.server.ts") });
    expect(JSON.parse(JSON.stringify(app))).toEqual(app);

  });
});

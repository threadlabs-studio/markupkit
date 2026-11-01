import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { withPlugins } from "../dist/config.js";
import { buildApplication, createApplication, devApplication, loadConfig, type MarkupKitPlugin, type NavigationItem, type NavigationQuery, type PageSource } from "../dist/index.js";
import { write } from "./fixture.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

// A minimal page plugin: .note files are HTML Next page bodies whose @href() and @asset() references
// resolve through MarkupKit. Its config() mounts one directory at two prefixes and supplies the layout.
function notes(root: string): MarkupKitPlugin {
  return {
    name: "notes",
    config: () => ({ headScript: "window.notes = true;", pages: [{ dir: "docs", prefix: "/v/one/", alias: true }, { dir: "docs" }],
      layout: { component: join(root, "plugin/shell.html"), server: { async load({ navigation }: { navigation: (query?: NavigationQuery) => Promise<readonly NavigationItem[]> }) {
        const items = await navigation({ from: "/v/one/" });
        return { props: { links: items.map(item => item.label + (item.current === "page" ? "*" : "")).join(", ") } };
      } } } }),
    pages: { extensions: [".note"], compile(source, page) {
      const tag = "page-note-" + createHash("sha256").update(page.file).digest("hex").slice(0, 12);
      const body = source.replace(/@href\(([^)]+)\)/g, (_, target: string) => page.href(resolve(dirname(page.file), target)) ?? "missing")
        .replace(/@asset\(([^)]+)\)/g, (_, file: string) => page.asset(resolve(dirname(page.file), file)));
      // A note's head content and mk: settings come before its <article>, and go in the page's <defs>.
      const article = body.indexOf("<article");
      return `<template component="${tag}"><defs>${body.slice(0, article)}</defs>${body.slice(article)}</template>`;
    } },
  };
}

async function site() {
  const root = await mkdtemp(join(tmpdir(), "markupkit-plugins-")); roots.push(root);
  await write(root, "package.json", '{"type":"module"}');
  await write(root, "plugin/shell.html", '<template component="notes-shell"><defs><prop name="links" type="string" required>Links</prop></defs><main><nav>{$links}</nav><slot name="page"></slot></main></template>');
  await write(root, "docs/01.index.note", '<title>Home</title><meta name="mk:label" content="Home"><article>Home body</article>');
  await write(root, "docs/02.install.note", '<title>Install</title><meta name="mk:label" content="Installing"><meta name="mk:alias" content="/start/"><article><a href="@href(01.index.note)">Back</a> <img src="@asset(mark.svg)" alt="Mark"> Install body</article>');
  await write(root, "docs/03.hidden.note", '<meta name="mk:navigation" content="hidden"><article>Hidden body</article>');
  await write(root, "docs/mark.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
  return root;
}

it("routes plugin pages through page directories, metadata, aliases, and a plugin layout", async () => {
  const root = await site();
  const application = await createApplication({ root, plugins: [notes(root)] });
  try {
    expect(application.routes.map(route => route.pattern).sort()).toEqual(["/", "/hidden/", "/install/", "/start/", "/v/one/", "/v/one/hidden/", "/v/one/install/", "/v/one/start/"]);
    const install = (await application.render("/v/one/install/")).html;
    expect(install).toContain("<nav>Home, Installing*</nav>");
    expect(install).toContain("<script>window.notes = true;</script>");
    // Links resolve to the first directory that serves the target; referenced files get stable URLs.
    expect(install).toContain('href="/v/one/"');
    expect(install).toMatch(/src="\/_markupkit\/files\/[0-9a-f]{16}-mark\.svg"/);
    expect([...application.files.values()]).toEqual([await realpath(join(root, "docs/mark.svg"))]);
    // An alias renders its page and marks the page's own navigation entry current.
    const alias = (await application.render("/v/one/start/")).html;
    expect(alias).toContain("Install body");
    expect(alias).toContain("<nav>Home, Installing*</nav>");
    expect((await application.render("/hidden/")).html).toContain("Hidden body");
  } finally { await application.close(); }
}, 60_000);

it("keeps head scripts apart, refuses private files, and lays out an alias like its page", async () => {
  const root = await site();
  // Each script is its own element: joined, ASI would call the plugin's last expression with this one.
  await write(root, "app/head.js", "(() => { document.documentElement.dataset.user = 'yes'; })();");
  await write(root, "app/layouts/guide.html", '<template component="guide-shell"><main>Guide<slot name="page"></slot></main></template>');
  const application = await createApplication({ root, plugins: [notes(root)], layoutDefaults: { "/install/": "guide" } });
  try {
    expect((await application.render("/install/")).html).toContain("<script>window.notes = true;</script><script>(() => {");
    expect((await application.render("/install/")).html).toContain(' component="guide-shell"');
    expect((await application.render("/start/")).html).toContain(' component="guide-shell"');
  } finally { await application.close(); }
  for (const secret of [".env", ".git/config", "docs/server.pem"]) {
    await write(root, secret, "SECRET=1");
    await write(root, "docs/04-secret.note", `<article><img src="@asset(${join(root, secret)})" alt=""></article>`);
    await expect(createApplication({ root, plugins: [notes(root)] })).rejects.toThrow(/private/);
  }
}, 60_000);

it("serves a page-wide stylesheet from outside the root in development", async () => {
  const root = await site();
  // A plugin's own stylesheet lives in its package, outside the site's root.
  const outside = await mkdtemp(join(tmpdir(), "markupkit-theme-")); roots.push(outside);
  await write(outside, "theme.css", "html { color: rgb(1, 2, 3); }");
  const server = await devApplication({ root, port: 0, plugins: [notes(root)], css: [join(outside, "theme.css")] });
  try {
    const html = await (await fetch(server.url + "v/one/install/")).text();
    const href = /<link rel="stylesheet" href="([^"]*theme\.css)"/.exec(html)![1]!;
    // The real path: Vite refuses a temporary directory's short name on Windows, and macOS's /var is a link.
    expect(href).toContain((await realpath(outside)).replaceAll("\\", "/"));
    expect((await fetch(new URL(href, server.url))).status).toBe(200);
  } finally { await server.close(); }
}, 60_000);

it("serves plugin page files and recompiles edited pages in development", async () => {
  const root = await site();
  const server = await devApplication({ root, port: 0, plugins: [notes(root)] });
  try {
    const html = await (await fetch(server.url + "v/one/install/")).text();
    const image = await fetch(new URL(/src="([^"]+mark\.svg)"/.exec(html)![1]!, server.url));
    expect([image.status, image.headers.get("content-type")]).toEqual([200, "image/svg+xml"]);
    await write(root, "docs/02.install.note", '<title>Install</title><meta name="mk:label" content="Installing"><article>Edited body</article>');
    await expect.poll(async () => (await fetch(server.url + "v/one/install/")).text(), { timeout: 10_000 }).toContain("Edited body");
  } finally { await server.close(); }
}, 60_000);

it("recompiles a plugin page in development when a file it watches changes, outside the root too", async () => {
  const root = await site();
  const outside = await mkdtemp(join(tmpdir(), "markupkit-watched-")); roots.push(outside);
  const banner = join(outside, "banner.txt");
  await write(outside, "banner.txt", "First banner");
  const plugin = notes(root);
  const compile = plugin.pages!.compile;
  const watching: MarkupKitPlugin = { ...plugin, pages: { extensions: plugin.pages!.extensions, async compile(source, page) {
    page.watch(banner);
    return (await compile(source, page)).replace("Install body", await readFile(banner, "utf8"));
  } } };
  const application = await createApplication({ root, plugins: [watching] });
  try { expect(application.watchFiles).toEqual(new Set([resolve(banner)])); } finally { await application.close(); }
  const server = await devApplication({ root, port: 0, plugins: [watching] });
  try {
    expect(await (await fetch(server.url + "v/one/install/")).text()).toContain("First banner");
    await write(outside, "banner.txt", "Second banner");
    await expect.poll(async () => (await fetch(server.url + "v/one/install/")).text(), { timeout: 10_000 }).toContain("Second banner");
  } finally { await server.close(); }
}, 60_000);

it("builds plugin pages with the files they reference", async () => {
  const root = await site();
  const result = await buildApplication({ root, plugins: [notes(root)] });
  expect(result.routes).toContain("/v/one/start/");
  const [file] = await readdir(join(result.outDir, "_markupkit/files"));
  expect(file).toMatch(/^[0-9a-f]{16}-mark\.svg$/);
  expect(await readFile(join(result.outDir, "v/one/install/index.html"), "utf8")).toContain(`/_markupkit/files/${file}`);
}, 60_000);

it("adds a plugin's page folders, stylesheets, and folder layout to the site's own", async () => {
  const root = await site();
  await write(root, "app/pages/about.html", '<template component="page-about"><h1>About</h1></template>');
  await write(root, "app/layouts/default.html", '<template component="site-shell"><main class="site"><slot name="page"></slot></main></template>');
  const shell = { component: join(root, "plugin/shell.html"), server: { load: () => ({ props: { links: "Docs" } }) } };
  const docs: MarkupKitPlugin = { ...notes(root), config: () => ({ pages: [{ dir: "docs", prefix: "/docs/", layout: shell }], css: ["plugin/docs.css"] }) };
  const options = await withPlugins({ root, css: ["@/styles/site.css"], plugins: [docs] });
  expect(options.css).toEqual(["@/styles/site.css", "plugin/docs.css"]);
  expect(options.pages?.map(page => page.dir)).toEqual(["app/pages", "docs"]);
  const application = await createApplication(options);
  try {
    expect(application.routes.map(route => route.pattern).sort()).toEqual(["/about/", "/docs/", "/docs/hidden/", "/docs/install/", "/docs/start/"]);
    // The site's page keeps the site's default layout; the plugin's pages get the folder's layout.
    expect((await application.render("/about/")).html).toContain(' component="site-shell"');
    const install = (await application.render("/docs/install/")).html;
    expect(install).toContain(' component="notes-shell"');
    expect(install).not.toContain(' component="site-shell"');
  } finally { await application.close(); }
}, 60_000);

it("names plugin layouts that mk:layout selects, with their own loaders and declared props", async () => {
  const root = await site();
  await write(root, "plugin/home.html", '<template component="home-shell"><defs><prop name="title" type="string" required>Title</prop></defs><main><h1>{$title}</h1><slot name="page"></slot></main></template>');
  await write(root, "docs/04.landing.note", '<meta name="mk:layout" content="home"><article>Landing body</article>');
  const seen: (readonly string[])[] = [];
  const data = { title: "Welcome", sidebar: "unused by home" };
  const plugin: MarkupKitPlugin = { name: "home", config: () => ({ layouts: { home: { component: join(root, "plugin/home.html"), server: {
    // A loader returns exactly the props its layout declares.
    load: ({ propNames }) => { seen.push(propNames); return { props: Object.fromEntries(Object.entries(data).filter(([name]) => propNames.includes(name))) }; } } } } }) };
  // A later plugin's layout of the same name loses to the earlier one's.
  await write(root, "plugin/later.html", '<template component="later-shell"><main><slot name="page"></slot></main></template>');
  const later: MarkupKitPlugin = { name: "later", config: () => ({ layouts: { home: { component: join(root, "plugin/later.html") } } }) };
  const application = await createApplication({ root, plugins: [notes(root), plugin, later] });
  try {
    const { body } = await application.render("/landing/");
    expect(body).toContain(' component="home-shell"');
    expect(body).toContain("<h1>Welcome</h1>");
    expect(seen).toEqual([["title"]]);
  } finally { await application.close(); }
  // The site's app/layouts/home.html wins over the plugin's, and its own layouts entry wins over both.
  await write(root, "app/layouts/home.html", '<template component="site-home"><main><slot name="page"></slot></main></template>');
  await write(root, "app/own.html", '<template component="own-home"><main><slot name="page"></slot></main></template>');
  for (const [layouts, shell] of [[undefined, "site-home"], [{ home: { component: "app/own.html" } }, "own-home"]] as const) {
    const site = await createApplication({ root, plugins: [notes(root), plugin], ...(layouts === undefined ? {} : { layouts }) });
    try { expect((await site.render("/landing/")).body).toContain(` component="${shell}"`); }
    finally { await site.close(); }
  }
  // Plugins' layouts stay apart from the site's layouts option.
  expect((await withPlugins({ root, plugins: [plugin] })).layouts).toBeUndefined();
});

it("names the page and the expected file for a missing named layout", async () => {
  const root = await site();
  await write(root, "docs/04.landing.note", '<meta name="mk:layout" content="missing"><article>Landing body</article>');
  await expect(createApplication({ root, plugins: [notes(root)] }))
    .rejects.toThrow(/04\.landing\.note: Layout missing needs .*app\/layouts\/missing\.html or a layouts entry named missing\./);
});

it("loads markupkit.config.ts for a wrapping command", async () => {
  const root = await site();
  expect(await loadConfig(root)).toEqual({});
  await write(root, "markupkit.config.ts", "const base: string = '/docs/';\nexport default { base };");
  expect(await loadConfig(root)).toEqual({ base: "/docs/" });
  await write(root, "markupkit.config.js", "export default {};");
  await expect(loadConfig(root)).rejects.toThrow(/Choose one markupkit\.config\.ts or \.js/);
});

it("makes a page directory's 404 page the not-found page only at /, with that directory's layout", async () => {
  const root = await site();
  await write(root, "docs/404.note", "<title>Lost</title><article>Nothing here</article>");
  const application = await createApplication({ root, plugins: [notes(root)] });
  try {
    expect(application.routes.map(route => route.pattern).filter(pattern => pattern.includes("404"))).toEqual([]);
    for (const path of ["/v/one/404/", "/v/one/missing/", "/missing/"]) {
      const page = await application.render(path);
      expect([page.status, page.body.includes("Nothing here"), page.body.includes(' component="notes-shell"')]).toEqual([404, true, true]);
    }
  } finally { await application.close(); }
  // Two not-found pages at / are a conflict that names both.
  await write(root, "more/404.html", '<template component="page-other-404"><h1>Other</h1></template>');
  await expect(createApplication({ root, plugins: [notes(root)], pages: [{ dir: "more" }] })).rejects.toThrow(/Route conflict: .*404\.html \(\/404\/\) and .*404\.note/);
});


it("shares an immutable static page-source catalog before compilation, with native mount aliases", async () => {
  const root = await site();
  await write(root, "docs/04.later.note", "<article>Later</article>");
  await write(root, "docs/404.note", "<article>Lost</article>");
  await write(root, "app/pages/about.html", '<template component="catalog-about"><main>About</main></template>');
  await write(root, "app/pages/account/[id].html", '<template component="catalog-account"><main>Account</main></template>');
  const original = notes(root); const seen: (readonly PageSource[])[] = [];
  const plugin: MarkupKitPlugin = { ...original, pages: { extensions: [".note"], compile(source, page) {
    expect(page.pages).toBeDefined(); seen.push(page.pages);
    return original.pages!.compile(source, page);
  } } };
  const application = await createApplication({ root, base: "/manual/", plugins: [plugin] });
  try {
    const catalog = seen[0]!;
    expect(new Set(seen).size).toBe(1);
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(catalog.every(Object.isFrozen)).toBe(true);
    expect(catalog).toEqual(expect.arrayContaining([
      { file: join(root, "docs/01.index.note"), href: "/manual/v/one/", aliasOf: "/manual/" },
      { file: join(root, "docs/01.index.note"), href: "/manual/" },
      { file: join(root, "docs/04.later.note"), href: "/manual/v/one/later/", aliasOf: "/manual/later/" },
      { file: join(root, "app/pages/about.html"), href: "/manual/about/" },
    ]));
    expect(catalog.some(page => page.file.endsWith("404.note") || page.file.endsWith("[id].html"))).toBe(false);
    // Metadata aliases are known only after compilation; the catalog names source mounts.
    expect(catalog.some(page => page.href.endsWith("/start/"))).toBe(false);
  } finally { await application.close(); }
});

it("refreshes page-source cache identity and membership after development edits", async () => {
  const root = await site(); const original = notes(root);
  const cache = new WeakMap<readonly PageSource[], string>();
  const generations = new Set<readonly PageSource[]>();
  const plugin: MarkupKitPlugin = { ...original, pages: { extensions: [".note"], async compile(source, page) {
    expect(page.pages).toBeDefined(); generations.add(page.pages);
    let catalog = cache.get(page.pages);
    if (catalog === undefined) {
      catalog = [...new Set(page.pages.map(entry => entry.file.split(/[/\\]/).at(-1)))].join(",");
      cache.set(page.pages, catalog);
    }
    return (await original.pages!.compile(source, page)).replace("Install body", `Install body <aside>${catalog}</aside>`);
  } } };
  const server = await devApplication({ root, port: 0, plugins: [plugin] });
  try {
    const content = async () => (await fetch(server.url + "v/one/install/")).text();
    expect(await content()).toContain("03.hidden.note");
    await write(root, "docs/04.added.note", "<article>Added</article>");
    await expect.poll(content, { timeout: 10_000 }).toContain("04.added.note");
    await rm(join(root, "docs/03.hidden.note"));
    await expect.poll(content, { timeout: 10_000 }).not.toContain("03.hidden.note");
    expect(generations.size).toBeGreaterThanOrEqual(3);
  } finally { await server.close(); }
}, 30_000);

function scopedNotes(root: string, seen: { scope: string | undefined; file: string; pages: readonly PageSource[] }[] = []): MarkupKitPlugin {
  const original = notes(root).pages!;
  return { name: "scoped-notes", pages: { extensions: original.extensions, async compile(source, page) {
    seen.push({ scope: page.scope, file: page.file, pages: page.pages });
    const suffix = createHash("sha256").update(page.scope ?? "unscoped").digest("hex").slice(0, 8);
    const compiled = await original.compile(source, page);
    return compiled.replace(/page-note-[a-f0-9]{12}/g, tag => tag + "-" + suffix)
      .replace("<article", `<article data-scope="${page.scope ?? "unscoped"}"`);
  } } };
}

it("compiles a plugin source once per scope, resolving scoped links and original relative dependencies", async () => {
  const root = await site(), seen: Parameters<typeof scopedNotes>[1] = [];
  await write(root, "parts/card.html", '<template component="source-card"><span>Original component</span></template>');
  const original = scopedNotes(root, seen);
  const plugin: MarkupKitPlugin = { ...original, pages: { ...original.pages!, async compile(source, page) {
    const resource = await original.pages!.compile(source, page);
    return page.file.endsWith("02.install.note") ? '<link rel="component" href="../parts/card.html">' + resource.replace("Install body", "Install body <source-card></source-card>") : resource;
  } } };
  const options = { root, base: "/manual/", plugins: [plugin], pages: [
    { dir: "docs", prefix: "/en/", scope: "en" },
    { dir: "docs", prefix: "/fr/", scope: "fr", alias: true },
    { dir: "docs", prefix: "/fr/v/current/", scope: "fr", alias: true },
  ] };
  const application = await createApplication(options);
  try {
    expect(seen.filter(page => page.file.endsWith("02.install.note")).map(page => page.scope).sort()).toEqual(["en", "fr"]);
    const english = await application.render("/manual/en/install/"), french = await application.render("/manual/fr/install/");
    expect(english.html).toContain('data-scope="en"'); expect(english.html).toContain('href="/manual/en/"');
    expect(french.html).toContain('data-scope="fr"'); expect(french.html).toContain('href="/manual/fr/"');
    expect(french.html).toContain("Original component");
    expect(french.html).toMatch(/src="\/manual\/_markupkit\/files\/[a-f0-9]{16}-mark\.svg"/);
    expect(french.html).toContain('rel="canonical" href="/manual/en/install/"');
    const alias = await application.render("/manual/fr/v/current/start/");
    expect(alias.html).toContain('data-scope="fr"'); expect(alias.html).toContain('href="/manual/fr/"');
    expect(seen[0]!.pages).toEqual(expect.arrayContaining([{ file: join(root, "docs/02.install.note"), href: "/manual/fr/install/", aliasOf: "/manual/en/install/", scope: "fr" }]));
    expect(new Set(seen.map(page => page.pages)).size).toBe(1);
  } finally { await application.close(); }
  const builtSite = await buildApplication(options);
  const built = await readFile(join(builtSite.outDir, "fr/install/index.html"), "utf8");
  expect(built).toContain('data-scope="fr"'); expect(built).toContain('href="/manual/fr/"'); expect(built).toContain("Original component");
}, 30_000);

it("selects mounted files before compilation and exposes only retained mounts to compilers", async () => {
  const root = await site(), seen: Parameters<typeof scopedNotes>[1] = [], catalogs = new Set<readonly PageSource[]>();
  await write(root, "docs/excluded.note", "not a component and must not compile");
  const application = await createApplication({ root, plugins: [scopedNotes(root, seen)], pages: [
    { dir: "docs", prefix: "/en/", scope: "en", include: async (file, pages) => {
      catalogs.add(pages); expect(Object.isFrozen(pages)).toBe(true); expect(pages.every(Object.isFrozen)).toBe(true);
      expect(pages.some(page => page.file.endsWith("excluded.note"))).toBe(true);
      return !file.endsWith("excluded.note");
    } },
  ] });
  try {
    expect(catalogs.size).toBe(1);
    expect(application.routes.some(route => route.pattern.includes("excluded"))).toBe(false);
    expect(seen.every(page => !page.file.endsWith("excluded.note") && page.pages.every(source => !source.file.endsWith("excluded.note")))).toBe(true);
  } finally { await application.close(); }
});

it("rejects selected aliases whose canonical owning file was excluded", async () => {
  const root = await site();
  await expect(createApplication({ root, plugins: [scopedNotes(root)], pages: [
    { dir: "docs", prefix: "/en/", include: file => !file.endsWith("02.install.note") },
    { dir: "docs", prefix: "/fr/", alias: true },
  ] })).rejects.toThrow(/owning page.*\/en\/install\//);
  // A different source at the same URL cannot inherit the excluded file's aliases.
  await write(root, "replacement/02.install.note", "<article>Different source</article>");
  await expect(createApplication({ root, plugins: [scopedNotes(root)], pages: [
    { dir: "docs", prefix: "/en/", include: file => !file.endsWith("02.install.note") },
    { dir: "replacement", prefix: "/en/" },
    { dir: "docs", prefix: "/fr/", alias: true },
  ] })).rejects.toThrow(/owning page.*\/en\/install\//);
});

it("rediscovers scoped source selection when an overriding page is added and removed", async () => {
  const root = await site(), seen: Parameters<typeof scopedNotes>[1] = [];
  await write(root, "translations/.keep", "");
  const translated = join(root, "translations/02.install.note");
  const server = await devApplication({ root, port: 0, plugins: [scopedNotes(root, seen)], pages: [
    { dir: "docs", prefix: "/en/", scope: "en" },
    { dir: "translations", prefix: "/fr/", scope: "fr" },
    { dir: "docs", prefix: "/fr/", scope: "fr", alias: true,
      include: (file, pages) => file !== join(root, "docs/02.install.note") || !pages.some(page => page.file === translated) },
  ] });
  try {
    const content = async () => (await fetch(server.url + "fr/install/")).text();
    expect(await content()).toContain('data-scope="fr"');
    await write(root, "translations/02.install.note", "<article>French translation</article>");
    await expect.poll(content, { timeout: 10_000 }).toContain("French translation");
    await rm(translated);
    await expect.poll(content, { timeout: 10_000 }).toContain("Install body");
    expect(new Set(seen.map(page => page.pages)).size).toBeGreaterThanOrEqual(3);
  } finally { await server.close(); }
}, 30_000);

it("preserves duplicate URL diagnostics when alias owners share a conflicting path", async () => {
  const root = await site();
  await write(root, "docs/02.index.note", "<article>Second home</article>");
  await expect(createApplication({ root, plugins: [notes(root)] })).rejects.toThrow(/01\.index\.note.*02\.index\.note/s);
});

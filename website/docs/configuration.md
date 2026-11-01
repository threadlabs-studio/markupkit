---
title: Configuration
order: 8
description: markupkit.config.ts · plugins · build hooks · build manifest · command line · using MarkupKit from code
---

# Configuration

MarkupKit works without configuration. To change a setting, add `markupkit.config.ts` (or `.js`) at
the project root:

```ts
// markupkit.config.ts
import { defineConfig } from '@threadlabs/markupkit';

export default defineConfig({
  base: '/docs/',
  origin: 'https://example.com',
});
```

::: table

- Option: `base`
  Default: `/`
  Does: Serves the site under a path, such as `/docs/`.

- Option: `origin`
  Default: `http://localhost`
  Does: The site's origin, used for `url` in loaders. Setting it writes [`sitemap.xml`](#search-engines).

- Option: `outDir`
  Default: `dist`
  Does: Where `build` writes the site.

- Option: `layout`
  Default: `default` when `app/layouts/default.html` exists
  Does: The layout name for every page, or `false` for none.

- Option: `layouts`
  Default: none
  Does: [Named layouts](#named-layouts) beside `app/layouts/`, such as `{ home: { component: 'theme/home.html' } }`.

- Option: `layoutDefaults`
  Default: none
  Does: Layout names by URL prefix, such as `{ '/admin/': 'admin' }`.

- Option: `pages`
  Default: `[{ dir: 'app/pages' }]`
  Does: Page folders and the URL prefix each serves.

- Option: `routes`
  Default: none
  Does: Pages at URLs of your choosing (below).

- Option: `redirects`
  Default: none
  Does: Old paths and where each now lives, such as `{ '/start/': '/guide/' }` ([redirects](/routes#redirects)).

- Option: `fileRoutes`
  Default: `true`
  Does: `false` turns off page folders, so only `routes` remain.

- Option: `css`
  Default: none
  Does: Page-wide stylesheets for rules such as `html` and `body`, for example `['@/styles/page.css']`. Components keep their own styles.

- Option: `plugins`
  Default: none
  Does: [Plugins](#plugins), such as a Markdown page format.

- Option: `prefetch`
  Default: `interaction`
  Does: What links load before a click: `interaction`, `visible`, or `none` ([details](/client-navigation#faster-clicks)).

- Option: `robots`
  Default: none
  Does: `true`, or the text of `robots.txt`, for the build to write ([search engines](#search-engines)).

- Option: `linkCheck`
  Default: `error`
  Does: What `build` does with a [broken internal link](#link-check): `error` fails the build, and `warn` reports it.

- Option: `csp`
  Default: generated
  Does: Sources to add to each page's [Content Security Policy](#content-security-policy), `reportOnly`, or `false` for none.

:::

A page's own `mk:layout` wins over `layoutDefaults`, which win over `layout`. Each selects the outermost
layout; a folder's `_layout.html` nests inside it ([nested layouts](/routes#nested-layouts)).

## `@/` and built-in components

`@/` is the project root:

```html
<link rel="component" href="@/app/components/card.html">
```

```ts
import { site } from '@/lib/site.ts';
```

It works in component links, component modules, stylesheet `@import`s, and loader imports. The built-in
components `<mk-nav>`, `<mk-breadcrumbs>`, and `<mk-pager>` need no link at all; the `mk-` prefix is
reserved for them.

## Routes in code

`routes` adds pages at URLs of your choosing, with the same loaders, layouts, and parameters as
page files:

```ts
export default defineConfig({
  routes: [{
    pattern: '/catalog/[id]/',
    component: 'app/catalog/item.html',
    server: 'app/catalog/item.server.ts',
    layouts: [{ component: 'app/catalog/shell.html' }],
  }],
});
```

## Page folders

`pages` can serve one folder at several URL prefixes, which is how a documentation site keeps
versions side by side. A folder can also give its pages a layout, and `optional: true` skips a folder
that doesn't exist:

```ts
export default defineConfig({
  pages: [
    { dir: 'app/pages' },
    { dir: 'docs', prefix: '/docs/', layout: 'docs' },   // app/layouts/docs.html
  ],
});
```

A page's own `mk:layout` wins over its folder's layout, which wins over `layoutDefaults` and `layout`.

A folder served at a second prefix, such as the current version of the docs at both `/` and
`/v/current/`, marks that entry `alias: true`. Its pages are served and navigable there, are left
out of [`sitemap.xml`](#search-engines), and each has a `<link rel="canonical">` to the same page
under the folder's own prefix, unless the page sets one:

```ts
export default defineConfig({
  pages: [
    { dir: 'docs' },
    { dir: 'docs', prefix: '/v/current/', alias: true },
  ],
});
```

A folder at two prefixes without `alias: true` on one of them is an error that names both, as is an
alias entry without an entry for the folder itself.

### Select and scope page sources

A page directory's `include(file, pages)` callback selects files before compilation. `file` is the original absolute source path; `pages` is the shared, immutable catalog of candidate static source mounts. Return a boolean or a promise of one. It runs for ordinary pages, including parameterized page files, while the catalog contains static mounts. Error and not-found pages keep their existing discovery behavior. An alias that remains selected requires its owning page to remain selected too.

Use a nonempty `scope` name when a page plugin generates different links or labels for several mounts of the same file:

```ts
export default defineConfig({
  pages: [
    { dir: 'notes', prefix: '/reference/', scope: 'reference' },
    {
      dir: 'notes', prefix: '/reader/', alias: true, scope: 'reader',
      include: async file => !file.endsWith('/internal.note'),
    },
  ],
});
```

Each plugin source compiles once per scope. `page.scope` names that scope, and `page.href(file)` prefers the source's first mount within it, falling back to the source's first application mount. The compiler must give each scoped page its own component name. Ordinary HTML resources retain their shared definition. `page.file`, relative component imports, controllers and assets keep their original source location. Directory aliases retain their owning canonical URL and sitemap policy.

Selection receives the candidate catalog. Compilation receives the retained catalog, with an optional `scope` on each mount. Both catalogs have fresh identities on development rediscovery. Source edits and changes in the mounted folders rerun selection and compilation.

## Plugins

A plugin can add a page format and adjust options. This one makes `.note` files into pages:

```ts
import { createHash } from 'node:crypto';
import { defineConfig, type MarkupKitPlugin } from '@threadlabs/markupkit';

const notes: MarkupKitPlugin = {
  name: 'notes',
  pages: {
    extensions: ['.note'],
    compile(source, page) {
      // Each file and compilation scope needs its own valid component name.
      const name = createHash('sha256').update(JSON.stringify([page.file, page.scope])).digest('hex').slice(0, 12);
      return `<template component="note-${name}"><defs><title>Note</title></defs><article>${source}</article></template>`;
    },
  },
};

export default defineConfig({ plugins: [notes] });
```

MarkupKit routes, orders, watches, renders, and builds `.note` files like `.html` pages, and errors
name the `.note` file. A compiled page is an HTML Next component, so its head content and `mk:`
settings go in its `<defs>`. While compiling, a plugin can call:

- `page.pages` for immutable retained static source mounts, each with `file`, `href`, and optional `aliasOf` and `scope` values;
- `page.scope` for the directory's optional compilation scope;
- `page.href(file)` for another page's URL;
- `page.asset(file)` to serve a file the page references, such as an image, and get its URL;
- `page.watch(file)` for a file the page's output depends on, such as a metadata file beside it.

Every compilation within one discovery receives the same `page.pages` array. Each new discovery gets a fresh array, including after a development edit, so a `WeakMap` keyed by it can cache metadata read from those sources. The catalog is available before the first page compiles. Its URLs include the application's base; `aliasOf` points to the owning mount's URL. It lists source mounts, including pages hidden from navigation, rather than parameterized routes, error pages, or aliases and redirects declared in page metadata.

`markupkit dev` watches the project root, and also each file a plugin passes to `page.watch`, inside the
root or outside it. When one changes, it recompiles the pages, and each open page updates in place.
A changed component or page definition replaces the one in the browser: each of its instances
renders again with its props and slotted content, and it and every component it renders keep each
state the new definitions still declare. Scroll and every other component stay as they were, and the page's layers take their new props. A
change to a controller or other browser module, or to which layouts a page uses, reloads the page:

```ts
compile(source, page) {
  const shared = resolve(dirname(page.file), '_shared.md');
  page.watch(shared);
  return render(source + readFileSync(shared, 'utf8'));
}
```

A plugin's `config(options)` returns settings to merge before the site starts. Page folders,
stylesheets, and routes are added to the site's own, and `app/pages` stays. Give a plugin's page
folders their own `layout` (a name, or `{ component, server: { load } }` with an in-process loader)
so it doesn't wrap the site's other pages. A plugin can also set a `headScript` that runs before
`app/head.js`, and add [named layouts](#named-layouts).
[Markupress](https://github.com/threadlabs-studio/markupress) is built this way.

### Named layouts

`layouts` gives layouts names that `mk:layout`, `layout`, `layoutDefaults`, and a `pages` entry's
`layout` can use, as they use the files in `app/layouts/`. Each is a component with an optional
loader: a module path, or for a plugin, the loader itself:

```ts
const theme: MarkupKitPlugin = {
  name: 'theme',
  config: () => ({
    layouts: {
      home: { component: '/path/to/theme/home.html', server: { load: () => ({ props: { title: 'Welcome' } }) } },
    },
  }),
};
```

A page with `<meta name="mk:layout" content="home">` then renders inside it, and its loader's
`data` reaches the page's loader as `parent`. A `default` entry wraps every page as `default.html`
does. MarkupKit looks a name up in this order, and the first match is the layout:

1. The site's own `layouts` option.
2. The site's `app/layouts/<name>.html`.
3. Plugins' `layouts`, earliest plugin first.

So a site replaces a plugin's `home` layout by adding `app/layouts/home.html`.

A layout's loader receives `propNames`, the props its component declares, which are the props it may
return. A plugin that has more data than a site's layout declares returns
`Object.fromEntries(Object.entries(data).filter(([name]) => propNames.includes(name)))` and passes
the rest on as `data`.

### Generated files

`generate` returns files that aren't pages, such as a search index or a feed, by application path.
It runs once every page has compiled, so a plugin can build the files from what its
[`pages.compile`](#plugins) read. The `notes` plugin above can list its notes this way:

```ts
const texts = new Map<string, string>();
const notes: MarkupKitPlugin = {
  name: 'notes',
  pages: {
    extensions: ['.note'],
    compile(source, page) {
      texts.set(page.file, source.trim());
      const name = createHash('sha256').update(page.file).digest('hex').slice(0, 12);
      return `<template component="note-${name}"><defs><title>Note</title></defs><article>${source}</article></template>`;
    },
  },
  generate: () => ({
    '/notes.json': JSON.stringify([...texts.values()]),
    '/notes.txt': { contents: [...texts.values()].join('\n'), type: 'text/plain; charset=utf-8' },
  }),
};

export default defineConfig({ base: '/docs/', plugins: [notes] });
```

Each key is an application path, as a [redirect](/routes#redirects)'s is, so with `base: '/docs/'` the file `/notes.json` is at `/docs/notes.json`. Each value is a string, a `Uint8Array`,
or `{ contents, type }`. `type` is the file's media type, and without it the path's extension gives
it (`.json` is `application/json`), or `application/octet-stream` for an extension MarkupKit doesn't
know. The context has `root` and `base`, as in `buildStart`.

- **`markupkit dev` and `createApplication`** answer each file's `GET` and `HEAD` with its type and
  `Cache-Control: no-cache`. The development server compiles the pages again after each change and
  runs `generate` again with them, so the next request reads the new file.
- **`markupkit build`** writes each file into the output, lists it in the
  [manifest](#build-manifest)'s `files`, and leaves it out of `sitemap.xml`. Links to it pass the
  [link check](#link-check). `markupkit preview` and `markupkit start` send its `type`. A generated
  `sitemap.xml` takes the place of the one `origin` writes, as a public one does.

A path is an error that names the plugin when it isn't a file path (it starts with `/`, names a
file and has no empty, `.` or `..` segment), when it is in `_markupkit/`, or when it is `404.html`, or
`robots.txt` with the `robots` option set. So is a path that a page's URL, a redirect, an endpoint, a
file in `public/`, a file a page references, or another plugin's `generate` also claims. When
`generate` throws, the error names the plugin and the hook.

`generate` covers a file that a build and the development server both serve. `buildEnd`'s
`writeFile` writes a file only into a build's output.

### Build hooks

`buildStart` and `buildEnd` run steps around a build, such as generating data before it or writing a
sitemap after it:

```ts
import { defineConfig, type MarkupKitPlugin } from '@threadlabs/markupkit';
import { generateApi } from './scripts/generate-api.ts';

const site: MarkupKitPlugin = {
  name: 'site',
  async buildStart({ root }) {
    await generateApi(root);   // writes app/data/api.json, which loaders read
  },
  async buildEnd({ pages, writeFile }) {
    const origin = 'https://example.com';
    await writeFile('sitemap.txt', pages.map(pathname => origin + pathname).join('\n'));
  },
};

export default defineConfig({ plugins: [site] });
```

`buildStart(context)` runs before MarkupKit reads any page, so pages, data, and assets it generates
are part of the build. It runs once per `markupkit build`, and once when `markupkit dev` starts; editing
a file doesn't rerun it. Its context has:

::: table

- Field: `command`
  Value: `'build'` or `'dev'`

- Field: `root`
  Value: The absolute project root.

- Field: `base`
  Value: The `base` option, such as `/docs/`.

:::

`buildEnd(context)` runs once the build has written every page, asset, `sitemap.xml` and `robots.txt`,
and the [manifest](#build-manifest), and before the [link check](#link-check) and the new output
replacing `outDir`. Links to the files it writes pass the link check. Its context has:

::: table

- Field: `root`, `base`
  Value: As in `buildStart`.

- Field: `outDir`
  Value: The directory being built, which becomes `outDir` when every `buildEnd` succeeds.

- Field: `routes`
  Value: Every route, as `createApplication` lists them.

- Field: `pages`
  Value: Each built page's URL path, such as `/docs/guide/`. `404.html` isn't one.

- Field: `writeFile(path, contents)`
  Value: Writes a string or bytes at a path relative to the output.

:::

`writeFile` refuses a path outside the output, a path in `_markupkit/`, and a file that already
exists, so a plugin can't replace a page, a public file, or another plugin's file.

Plugins run each hook in the order they're listed. If a hook throws, the build fails with an error
that names the plugin and the hook, and the previous `outDir` stays as it was. `markupkit preview`
and `createApplication` don't run either hook.

## Search engines

With `origin` set, `markupkit build` writes `sitemap.xml` at the site's base, listing each page at its
own URL:

```ts
export default defineConfig({ origin: 'https://example.com', base: '/docs/', robots: true });
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://example.com/docs/</loc></url>
<url><loc>https://example.com/docs/guide/</loc></url>
</urlset>
```

It lists every page in the [manifest](#build-manifest)'s `routes` except an
[`mk:alias`](/routes#the-page-head) URL or [alias page folder](#page-folders) page, whose page names its own URL as canonical, and a page
with `<meta name="robots" content="noindex">` (or `none`). Redirects and the not-found page are
outside `routes`. A page with `mk:navigation="hidden"` is listed: that setting concerns navigation,
and `noindex` takes a page out of search results. A `sitemap.xml` in `public/` is the site's own,
and the build keeps it.

`robots` writes `robots.txt`. `true` allows every crawler, and a string is the file's text. With
`origin` set, the file ends with a `Sitemap` line, unless the text has one:

```text
User-agent: *
Allow: /
Sitemap: https://example.com/docs/sitemap.xml
```

Crawlers read `robots.txt` at the origin's root, so for a site under a base path, the host places it
there. A `robots.txt` in `public/` beside the `robots` option is an error.

## Link check

`markupkit build` reads every page it wrote, along with its redirect pages and `404.html`, and checks
each `<a href>` and `<area href>` that leads under `base`. The build fails on a link to a page or file
that isn't in the output, or to a `#fragment` that names no `id` (or `<a name>`) in its page. A
fragment-only link such as `#install` checks the page it's on. The error names each page and link:

```text
Broken internal links:
  /docs/guide/ links to /docs/missing/, which is no page or file in the build.
  /docs/guide/ links to #nowhere, and /docs/guide/ has no element with id "nowhere".
```

Links to other sites and to paths outside `base` pass as written, as do `#`, `#top`, and text
fragments (`#:~:text=`). A link without its trailing slash, such as `/docs/guide`, finds the page at
`/docs/guide/`. The check reads the built HTML, so it covers the links and ids the server rendered.
`linkCheck: 'warn'` reports the same links as a warning and finishes the build.

## Content Security Policy

Every page carries the site's Content Security Policy, which MarkupKit generates from what the site's
components declare. It allows the scripts the site needs and nothing else:

```text
script-src 'self' https://js.stripe.com 'sha256-…'; object-src 'none'; base-uri 'none'
```

- `'self'` for MarkupKit's own modules, the page's component modules, and same-origin declared scripts.
- The origin of each [declared script](/routes#declared-scripts) any page, layout, or
  component of the site names, such as `https://js.stripe.com` for a checkout page that declares
  Stripe.js.
- A `sha256` hash of each inline head script: a plugin's `headScript` and `app/head.js`.
- `object-src 'none'` and `base-uri 'none'`, since pages use neither plugins nor `<base>`.

The `csp` option adds sources to any directive, in CSP's own grammar. They join the generated ones
and never replace them:

```ts
// markupkit.config.ts
export default defineConfig({
  csp: {
    'script-src': ['https://cdn.example/'],
    'connect-src': ["'self'", 'https://api.example'],
    'frame-src': ['https://js.stripe.com', 'https://hooks.stripe.com'],
  },
});
```

::: table

- Where: `markupkit build`
  Delivery: Each page's `<meta http-equiv="Content-Security-Policy">`, first in its head, so static hosts enforce it. A meta element ignores `frame-ancestors`, `report-uri`, and `sandbox`, so the page's meta leaves them out.

- Where: `markupkit start` and `application.fetch`
  Delivery: The `Content-Security-Policy` header, with every directive, beside the page's meta.

- Where: `markupkit dev`
  Delivery: The same header and meta, plus what Vite needs (below).

:::

`reportOnly: true` sends `Content-Security-Policy-Report-Only` instead, which reports violations and
blocks nothing. Only a header can report only, so built pages then carry no meta, and a static host
needs its own header configuration to report. `csp: false` turns the policy off.

The policy is site-wide. A document keeps the policy it loaded with, and
[client navigation](/client-navigation) moves between pages in place, so one policy covers
every page a visitor can reach. A policy per page would need a full page load whenever it changes.

In development, `markupkit dev` reports each violation in the terminal and the browser console, with the
page, what was blocked, the directive, and the line that would allow it:

```text
MarkupKit: /checkout/ blocked https://m.stripe.network/inner.html under frame-src. To allow it, add to markupkit.config.ts: csp: { "frame-src": ["https://m.stripe.network"] }
```

Vite's client and modules load from the development server, which `'self'` allows. Where the
policy restricts `connect-src` (or `default-src`), development adds `ws:` for Vite's HMR socket, and
where it restricts `style-src`, `'unsafe-inline'` for the styles Vite injects for CSS a module
imports. Builds have neither.

## Build manifest

`markupkit build` writes `_markupkit/manifest.json`, which lists the site's pages for tools such as a
link checker or a coverage report. Read it with `readManifest(outDir)`, which returns a typed
`BuildManifest`:

```ts
import { readManifest } from '@threadlabs/markupkit';

const { base, routes, pages, redirects, files } = await readManifest('dist');
```

```json
{
  "version": 1,
  "base": "/docs/",
  "routes": ["/docs/", "/docs/guide/"],
  "pages": [
    {
      "pathname": "/docs/",
      "pageName": "home-page",
      "browserModule": "/docs/_markupkit/page-0-BxfIu_Pn.js",
      "chunks": ["/docs/_markupkit/client-Cq3Rt8aZ.js"]
    }
  ],
  "redirects": [
    { "from": "/docs/start/", "to": "/docs/guide/", "status": 308 }
  ],
  "files": [
    { "pathname": "/docs/notes.json", "type": "application/json" }
  ]
}
```

::: table

- Field: `version`
  Value: The format version, `1`.

- Field: `base`
  Value: The `base` the site was built for.

- Field: `routes`
  Value: Each page's URL path, including `base`, in build order. `404.html` isn't listed.

- Field: `pages`
  Value: One entry per route, in the same order.

- Field: `pages[].pathname`
  Value: The page's URL path.

- Field: `pages[].pageName`
  Value: The page's component name.

- Field: `pages[].browserModule`
  Value: The URL of the page's own browser module.

- Field: `pages[].chunks`
  Value: URLs of the shared modules the page imports.

- Field: `redirects`
  Value: Each redirect page the build wrote, from the [`redirects` option](/routes#redirects), pages' [`mk:redirect-from`](/routes#redirects) and loaders' [`redirect()`](/loaders#redirecting).

- Field: `redirects[].from`
  Value: The old URL path, where the redirect page is.

- Field: `redirects[].to`
  Value: Where it sends readers: a URL path including `base`, or an absolute URL.

- Field: `redirects[].status`
  Value: The status a server answers with: 308 for the option and `mk:redirect-from`, and the loader's status for `redirect()`.

- Field: `files`
  Value: Each file plugins' [`generate`](#generated-files) returned.

- Field: `files[].pathname`
  Value: The file's URL path, including `base`.

- Field: `files[].type`
  Value: Its media type, which `markupkit preview` and `markupkit start` send.

:::

These fields are stable. A release may add fields at version `1`, so ignore fields you don't use.
`version` changes only when a field is removed, renamed, or changes meaning, and `readManifest`
refuses a version it doesn't know. File names inside `_markupkit/` change from build to build; read
them from the manifest. The manifest lists prerendered pages; pages that
[render on each request](/loaders#rendering-on-each-request) have no file to list.
`_markupkit/server/` holds the [request server](/deployment#the-node-server).

## Command line

```text
markupkit <command> [root] [options]
```

::: table

- Command: `markupkit dev`
  Does: Serves the application with in-place updates, rendering every page, endpoint, and middleware on request.

- Command: `markupkit build`
  Does: Prerenders pages and writes them, the browser bundles, and the request server to `dist/`.

- Command: `markupkit preview`
  Does: Serves `dist/` as a static host does: files only.

- Command: `markupkit start`
  Does: Serves the build on Node, without Vite: prerendered pages and assets from files, plus server-rendered pages, endpoints, and middleware ([deployment](/deployment#the-node-server)).

:::

::: table

- Option: `[root]`
  Commands: all
  Does: The project folder; the current folder unless given.

- Option: `--base /docs/`
  Commands: `dev`, `build`
  Does: Serves the site under a path. `preview` and `start` take it from the build.

- Option: `--origin https://example.com`
  Commands: `dev`, `build`
  Does: The origin of prerendered pages' `url`.

- Option: `--out-dir dist`
  Commands: `build`, `preview`, `start`
  Does: The build output.

- Option: `--port 3000`
  Commands: `dev`, `preview`, `start`
  Does: The port; `start` also reads `PORT`.

- Option: `--host 127.0.0.1`
  Commands: `dev`, `preview`, `start`
  Does: The host; `start` also reads `HOST`.

- Option: `--render-workers 4`
  Commands: all
  Does: How many workers render pages: the number of available CPUs, up to 8, unless given.

- Option: `-h`, `--help`
  Commands:
  Does: Lists the commands and options.

:::

Flags override the same settings in `markupkit.config.ts`. `start` runs the build alone and doesn't read
the config file.

## Using MarkupKit from code

```ts
import { buildApplication, createApplication, devApplication, previewApplication } from '@threadlabs/markupkit';

await buildApplication({ root: 'site' });

const app = await createApplication({ root: 'site' });
const page = await app.render('/about/');       // { status, html, head, … }
const response = await app.fetch(new Request('http://localhost/about/'));
await app.close();
```

These functions take the same options as the config file, which they don't read. Close
applications and servers when you're done.

`loadConfig(root)` reads `markupkit.config.ts` or `.js` at `root` as the CLI does, and returns its
options, or `{}` when there is no file. A command that wraps MarkupKit loads the site's config this way
and adds its own settings:

```ts
import { buildApplication, loadConfig } from '@threadlabs/markupkit';

const config = await loadConfig(root);
await buildApplication({ ...config, root, plugins: [...config.plugins ?? [], docs()] });
```

`app.fetch(request)` takes a standard `Request` and returns a `Response`, on Node, Deno 2.8+, and
Bun. Pass it directly, as in `Deno.serve(app.fetch)`. It answers as the development server does:
middleware, endpoints, and pages, with prerendered pages' loaders run as a build runs them. Its pages
don't include browser scripts; the development server adds those. `app.endpoints` lists the
`app/api` endpoints and `app.middleware` names the middleware file.

`startApplication({ outDir, port, host })` is `markupkit start`. Import it from
`@threadlabs/markupkit/server`, which never loads Vite; see [deployment](/deployment#from-code).

## Application descriptions

`describeApplication(options)` from `@threadlabs/markupkit/description` returns a build-time snapshot of routes, layouts, component sources, registered assets, redirects, and server references. MarkupNative uses this inventory to bind native implementations. Discovery runs explicitly configured plugin hooks but does not execute page loaders, controllers, endpoints, or middleware. Call `loadConfig()` explicitly if you want to load a configuration file. The snapshot contains private source paths and content; keep it in build tooling.

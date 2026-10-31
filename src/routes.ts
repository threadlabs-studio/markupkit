import { createHash } from "node:crypto";
import { existsSync, realpathSync, statSync } from "node:fs";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { configure, withPlugins, MarkupKitError, pluginLayouts, within, type PluginOptions } from "./config.js";
import { applicationResource, pageDefinition } from "./resource.js";
import type { ApplicationOptions, ApplicationRoute, EndpointRoute, MarkupKitPlugin, PageDirectory, PageSource, RouteGroup, RouteInput, RouteLayer } from "./types.js";

/** A query distinguishes compiled carriers while relative imports still resolve beside the original file. */
function scopedSourceURL(file: string, scope: string): string {
  const url = pathToFileURL(file); url.searchParams.set("mk-scope", scope); return url.href;
}
export function compiledPageURL(file: string, scope: string | undefined, sources: ReadonlyMap<string, string>): string {
  const scoped = scope === undefined ? undefined : scopedSourceURL(file, scope);
  return scoped !== undefined && sources.has(scoped) ? scoped : pathToFileURL(file).href;
}

/** The name of a [name], [...name] catch-all, or [[...name]] optional catch-all segment. */
export function parameter(segment: string): string | undefined {
  const match = /^\[(?:\.\.\.)?([A-Za-z][A-Za-z0-9_]*)\]$|^\[\[\.\.\.([A-Za-z][A-Za-z0-9_]*)\]\]$/.exec(segment);
  return match?.[1] ?? match?.[2];
}
/** How broadly a segment matches: 0 a literal, 1 [name], 2 [...name], 3 [[...name]]. A missing segment is -1. */
export function breadth(segment: string | undefined): number {
  if (segment === undefined) return -1;
  return parameter(segment) === undefined ? 0 : segment.startsWith("[[") ? 3 : segment.startsWith("[...") ? 2 : 1;
}
export function validSegment(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value !== "." && value !== ".." && !value.includes("/") && !/[\\\0?#]/.test(value);
}
export const redirectStatuses: readonly number[] = [301, 302, 303, 307, 308];
/** A redirect's Location: an application path, under base, or an absolute http(s) URL. */
export function redirectLocation(base: string, to: unknown, source: string): string {
  if (typeof to === "string" && /^\/(?![/\\])/.test(to)) return base + to.slice(1);
  try { if (typeof to === "string" && /^https?:$/.test(new URL(to).protocol)) return new URL(to).href; } catch { /* Reported below. */ }
  throw new MarkupKitError(`Redirect target ${String(to)} must be an application path starting with / or an http(s) URL.`, source);
}
/** The redirects option by deployment pathname, each to its Location. */
export function redirectTable(base: string, redirects: Readonly<Record<string, string>> = {}): ReadonlyMap<string, string> {
  const table = new Map<string, string>();
  for (const [from, to] of Object.entries(redirects)) {
    const segments = from.slice(1, -1).split("/").filter(Boolean);
    if (!/^\/(?:[^/]+\/)*$/.test(from) || segments[0] === "_markupkit" || !segments.every(validSegment)) {
      throw new MarkupKitError("Redirects need application paths with leading and trailing slashes, outside _markupkit.", from);
    }
    table.set(new URL(base + from.slice(1), "http://localhost").pathname, redirectLocation(base, to, from));
  }
  return table;
}
type DiscoveryOptions = Pick<ApplicationOptions, "base" | "routes" | "fileRoutes" | "pages" | "layout" | "layouts" | "layoutDefaults" | "plugins">;

export async function discoverRoutes(root = process.cwd(), options: DiscoveryOptions = {}): Promise<readonly ApplicationRoute[]> {
  return (await discover(root, options)).routes;
}

/**
 * Routes plus what plugins produced: compiled page sources by component path, the files pages
 * reference by deployment-relative path, and the files plugins watch.
 */
export async function discover(root: string, options: DiscoveryOptions) {
  const base = options.base ?? "/";
  const watched = new Set<string>();
  const watch = (file: string) => { watched.add(resolve(file)); };
  const compilers = new Map<string, NonNullable<MarkupKitPlugin["pages"]>>();
  for (const plugin of options.plugins ?? []) {
    for (const extension of plugin.pages?.extensions ?? []) {
      if (!/^\.[A-Za-z0-9]+$/.test(extension) || extension === ".html" || compilers.has(extension)) {
        throw new MarkupKitError(`Page extension ${extension} must be a unique .name other than .html.`, plugin.name);
      }
      compilers.set(extension, plugin.pages!);
    }
  }
  const pageExtension = (name: string) => [".html", ...compilers.keys()].find(extension => name.endsWith(extension) && name.length > extension.length);
  // Each route remembers its page directory's prefix, which page aliases are relative to.
  // folderLayouts are the _layout.html files from the page directory down to the page, outermost first.
  const routes: (Omit<ApplicationRoute, "pageName"> & { readonly prefix: string; readonly directoryLayout?: string | false | RouteLayer;
    readonly folderLayouts: readonly RouteLayer[]; readonly notFound?: true; readonly error?: true; readonly index?: true })[] = [];
  const selections = new Map<(typeof routes)[number], NonNullable<PageDirectory["include"]>>();
  const add = (input: RouteInput & { readonly scope?: string; readonly canonical?: string; readonly aliasOf?: string; readonly notFound?: true; readonly error?: true; readonly index?: true }, prefix: string, order?: readonly (string | null)[],
    directoryLayout?: string | false | RouteLayer, folderLayouts: readonly RouteLayer[] = [], groups: readonly RouteGroup[] = []): void => {
    if (!/^\/(?:[^/]+\/)*$/.test(input.pattern)) throw new MarkupKitError("Route patterns require leading and trailing slashes.", input.component);
    const segments = input.pattern.slice(1, -1).split("/").filter(Boolean);
    if (segments[0] === "_markupkit") throw new MarkupKitError("_markupkit is reserved for generated assets.", input.component);
    if (segments.some(segment => parameter(segment) === undefined && !/^[A-Za-z0-9_-]+$/.test(segment))) {
      throw new MarkupKitError("Route segments must be URL slugs or [named] parameters.", input.component);
    }
    if (segments.slice(0, -1).some(segment => breadth(segment) > 1)) throw new MarkupKitError("A [...catch-all] parameter must be the last route segment.", input.component);
    const params = segments.flatMap(segment => parameter(segment) ?? []);
    if (new Set(params).size !== params.length) throw new MarkupKitError("Route parameter names must be unique.", input.component);
    const absolute = (layer: RouteLayer): RouteLayer => ({ component: resolve(root, layer.component),
      ...(layer.server === undefined ? {} : { server: typeof layer.server === "string" ? resolve(root, layer.server) : layer.server }) });
    routes.push({ ...absolute(input), pattern: input.pattern, segments, params, layouts: (input.layouts ?? []).map(absolute), prefix, folderLayouts,
      ...(input.scope === undefined ? {} : { scope: input.scope }),
      ...(directoryLayout === undefined ? {} : { directoryLayout }), ...(groups.length === 0 ? {} : { groups }),
      ...(order === undefined ? {} : { order }), ...(input.canonical === undefined ? {} : { canonical: input.canonical }),
      ...(input.aliasOf === undefined ? {} : { aliasOf: input.aliasOf }),
      ...(input.notFound ? { notFound: true as const } : {}), ...(input.error ? { error: true as const } : {}), ...(input.index ? { index: true as const } : {}) });
  };
  // A number and a dot ("01.guide") order a file or directory and stay out of its URL. Route
  // segments cannot contain dots, so the prefix is never part of a name.
  const ordered = (name: string, source: string) => {
    const prefix = /^(\d+)\.(.*)$/.exec(name);
    if (prefix?.[2] === "") throw new MarkupKitError("Ordering prefix leaves an empty route segment.", source);
    return { slug: prefix?.[2] ?? name, rank: prefix?.[1] ?? null };
  };
  const visit = async (directory: string, prefix: string, segments: string[], order: (string | null)[],
    directoryLayout: string | false | RouteLayer | undefined, outer: readonly RouteLayer[], groups: readonly RouteGroup[]): Promise<void> => {
    const files = await readdir(directory, { withFileTypes: true });
    // As in public/, a page or page folder is a regular file or folder, so the URL tree is the file tree.
    for (const file of files) {
      if (!file.isSymbolicLink() || file.name.startsWith("_") || file.name.startsWith(".")) continue;
      const path = join(directory, file.name);
      if (pageExtension(file.name) !== undefined || await stat(path).then(info => info.isDirectory(), () => false)) {
        throw new MarkupKitError("Pages and page folders must not be symbolic links; add the target's folder to the pages option.", path);
      }
    }
    const names = new Set(files.filter(file => file.isFile()).map(file => file.name));
    const prefixDepth = prefix.split("/").filter(Boolean).length;
    const layer = (name: string, stem: string): RouteLayer => {
      const servers = ["ts", "js"].filter(ext => names.has(`${stem}.server.${ext}`));
      if (servers.length > 1) throw new MarkupKitError(`Choose one ${stem}.server.ts or .js loader.`, directory);
      return { component: join(directory, name), ...(servers[0] === undefined ? {} : { server: join(directory, `${stem}.server.${servers[0]}`) }) };
    };
    // A folder's _layout.html wraps its pages and its subfolders' pages, inside its parents' layouts.
    const folderLayouts = names.has("_layout.html") ? [...outer, layer("_layout.html", "_layout")] : outer;
    for (const name of [...names].sort()) {
      const extension = pageExtension(name);
      if (extension === undefined || name.startsWith("_") || name.startsWith(".")) continue;
      const stem = name.slice(0, -extension.length);
      const { slug, rank } = ordered(stem, join(directory, name));
      const parts = slug === "index" ? segments : [...segments, slug];
      // A 404 page at the root of a page directory is never a route: at the / prefix it is the
      // not-found page, and at any other prefix the site's not-found page serves those URLs too.
      const notFound = slug === "404" && parts.length === prefixDepth + 1;
      if (notFound && prefix !== "/") continue;
      add({ ...layer(name, stem), pattern: `/${parts.length === 0 ? "" : parts.join("/") + "/"}`, ...(notFound ? { notFound: true as const } : {}), ...(slug === "index" ? { index: true as const } : {}) },
        prefix, slug === "index" ? order : [...order, rank], directoryLayout, folderLayouts, groups);
    }
    for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!file.isDirectory() || file.name.startsWith(".") || file.name.startsWith("_")) continue;
      const { slug, rank } = ordered(file.name, join(directory, file.name));
      // A (group) folder orders and labels its pages and adds no URL segment.
      const label = /^\(([^()]*)\)$/.exec(slug)?.[1];
      if (label !== undefined) {
        if (label.trim() === "") throw new MarkupKitError("A route group needs a label inside its parentheses.", join(directory, file.name));
        await visit(join(directory, file.name), prefix, segments, order, directoryLayout, folderLayouts, [...groups, { label, order: rank, depth: segments.length }]);
        continue;
      }
      if (parameter(slug) === undefined && !/^[A-Za-z0-9_-]+$/.test(slug)) {
        throw new MarkupKitError("Route directories must be URL slugs, [named] parameters, or (groups).", join(directory, file.name));
      }
      await visit(join(directory, file.name), prefix, [...segments, slug], [...order, rank], directoryLayout, folderLayouts, groups);
    }
  };
  if (options.fileRoutes !== false) {
    const directories = options.pages ?? [{ dir: "app/pages", optional: true }];
    // A directory has one own prefix; any further mount of it is an alias of those pages.
    const own = new Map<string, string>();
    for (const { dir, prefix = "/", alias } of directories) {
      if (alias === true) continue;
      const previous = own.get(resolve(root, dir));
      if (previous !== undefined) {
        throw new MarkupKitError(`Page directory ${dir} is served at ${previous} and ${prefix}; mark the further one alias: true, so its pages name the first as canonical.`, resolve(root, dir));
      }
      own.set(resolve(root, dir), prefix);
    }
    for (const { dir, prefix = "/", layout, optional, alias, scope, include } of directories) {
      if (scope !== undefined && (typeof scope !== "string" || scope.length === 0)) throw new MarkupKitError("Page scope must be a nonempty string.", dir);
      if (include !== undefined && typeof include !== "function") throw new MarkupKitError("Page include must be a function.", dir);
      if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(prefix)) throw new MarkupKitError("Page directory prefixes need leading and trailing slashes around URL slugs.", dir);
      const directory = resolve(root, dir);
      if (!within(root, directory)) throw new MarkupKitError("Page directories must be inside the application root.", directory);
      let present = true;
      try { await stat(directory); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; present = false; }
      // app/pages is optional; a configured directory must exist.
      if (!present && !optional) throw new MarkupKitError("Page directory does not exist.", directory);
      const segments = prefix.split("/").filter(Boolean);
      const primary = own.get(directory);
      if (alias === true && primary === undefined) throw new MarkupKitError(`The alias page directory ${dir} at ${prefix} needs an entry that serves ${dir} itself.`, directory);
      const first = routes.length;
      if (present) await visit(directory, prefix, segments, segments.map(() => null), layout, [], []);
      for (let i = first; i < routes.length; i++) {
        const route = routes[i]!;
        routes[i] = { ...route, ...(scope === undefined ? {} : { scope }),
          ...(alias === true ? { aliasOf: primary + route.pattern.slice(prefix.length) } : {}) };
        if (include !== undefined && !route.notFound && !route.error) selections.set(routes[i]!, include);
      }
    }
  }
  for (const route of options.routes ?? []) add(route, "/");
  // app/error.html renders failures through the site's layout. Like the not-found page, it is no route.
  const errorPage = resolve(root, "app/error.html");
  if (existsSync(errorPage)) {
    if (["ts", "js"].some(extension => existsSync(resolve(root, `app/error.server.${extension}`)))) {
      throw new MarkupKitError("app/error.html has no loader: it receives status and message as props.", errorPage);
    }
    add({ component: errorPage, pattern: "/", error: true }, "/");
  }

  // A plugin page links to another page's first static URL, and serves the files it references.
  const sourceCatalog = (): readonly PageSource[] => Object.freeze(routes.filter(route => route.params.length === 0 && !route.notFound && !route.error)
    .map(route => Object.freeze({ file: route.component, href: base + route.pattern.slice(1),
      ...(route.scope === undefined ? {} : { scope: route.scope }),
      ...(route.aliasOf === undefined ? {} : { aliasOf: base + route.aliasOf.slice(1) }) })));
  const candidates = sourceCatalog(), excluded = new Set<(typeof routes)[number]>();
  for (const [route, include] of selections) {
    const keep = await include(route.component, candidates);
    if (typeof keep !== "boolean") throw new MarkupKitError("Page include must return a boolean.", route.component);
    if (!keep) excluded.add(route);
  }
  for (let i = routes.length - 1; i >= 0; i--) if (excluded.has(routes[i]!)) routes.splice(i, 1);
  const owningPaths = new Map(routes.filter(route => route.aliasOf === undefined).map(route => [route.pattern, route.component]));
  for (const route of routes) if (route.aliasOf !== undefined && owningPaths.get(route.aliasOf) !== route.component) {
    throw new MarkupKitError(`Alias requires an owning page at ${route.aliasOf}.`, route.component);
  }
  const pages = sourceCatalog();
  const pageURLs = new Map<string, string>();
  const scopedURLs = new Map<string, Map<string, string>>();
  for (const page of pages) {
    if (!pageURLs.has(page.file)) pageURLs.set(page.file, page.href);
    if (page.scope !== undefined) {
      const urls = scopedURLs.get(page.scope) ?? new Map<string, string>();
      if (!urls.has(page.file)) urls.set(page.file, page.href);
      scopedURLs.set(page.scope, urls);
    }
  }
  const realRoot = await realpath(root);
  const sources = new Map<string, string>();
  const files = new Map<string, string>();
  const resources = new Map<string, { readonly source: string; readonly resource: ReturnType<typeof applicationResource> }>();
  const resourceOf = async (component: string, scope?: string) => {
    const file = await realpath(component);
    const compiler = compilers.get(pageExtension(component) ?? ".html");
    const scoped = compiler !== undefined && scope !== undefined;
    const identity = scoped ? scopedSourceURL(file, scope) : file;
    const retained = resources.get(identity);
    if (retained !== undefined) return { identity, ...retained };
    // Read declarations only. Route discovery never executes loaders or controllers.
    let text = await readFile(file, "utf8");
    if (compiler !== undefined) {
      text = await compiler.compile(text, { file: component, watch, pages, ...(scope === undefined ? {} : { scope }),
        href: target => (scope === undefined ? undefined : scopedURLs.get(scope)?.get(resolve(target))) ?? pageURLs.get(resolve(target)),
        asset(file) {
          const absolute = resolve(file);
          let real: string;
          // The native resolver, as for the root: on Windows the JS one keeps 8.3 short names (RUNNER~1).
          try { real = realpathSync.native(absolute); } catch { throw new MarkupKitError(`Missing asset ${file}.`, component); }
          if (!within(realRoot, real) || !statSync(real).isFile()) throw new MarkupKitError(`Asset ${file} must be a file inside the application root.`, component);
          // Never publish what a stray reference could name: dotfiles and dot folders (.env, .git) or keys.
          if (relative(realRoot, real).split(sep).some(part => part.startsWith(".")) || /\.(?:pem|crt|key)$/i.test(real)) {
            throw new MarkupKitError(`Asset ${file} is private: dotfiles, dot folders, keys, and certificates are never published.`, component);
          }
          const name = `_markupkit/files/${createHash("sha256").update(relative(realRoot, real)).digest("hex").slice(0, 16)}-${basename(real)}`;
          files.set(name, real);
          return base + name.split("/").map(encodeURIComponent).join("/");
        } });
      sources.set(scoped ? scopedSourceURL(component, scope) : component, text);
    }
    const resource = applicationResource(text, scoped ? identity : pathToFileURL(file).href);
    const snapshot = { source: text, resource };
    resources.set(identity, snapshot);
    return { identity, ...snapshot };
  };
  // Page aliases are further routes for the same page, relative to its page directory, as its redirects
  // from old paths are. The loop also reaches the aliases it appends, which it skips.
  const redirects: { readonly from: string; readonly to: string; readonly component: string }[] = [];
  for (const route of routes) {
    if (route.canonical !== undefined || route.notFound || route.error) continue;
    const { resource } = await resourceOf(route.component, route.scope);
    const metadata = resource.components.get(pageDefinition(resource, route.component).contract.tag)!;
    for (const from of metadata.redirectsFrom) {
      if (!/^\/(?:[^/]+\/)*$/.test(from) || !from.slice(1, -1).split("/").filter(Boolean).every(validSegment)) {
        throw new MarkupKitError("mk:redirect-from needs a route path with leading and trailing slashes.", route.component);
      }
      if (route.params.length > 0) throw new MarkupKitError(`mk:redirect-from redirects to one URL, and ${route.pattern} has parameters.`, route.component);
      redirects.push({ from: route.prefix + from.slice(1), to: route.pattern, component: route.component });
    }
    for (const alias of metadata.aliases) {
      if (!/^\/(?:[^/]+\/)*$/.test(alias)) throw new MarkupKitError("mk:alias needs a route path with leading and trailing slashes.", route.component);
      add({ component: route.component, ...(route.scope === undefined ? {} : { scope: route.scope }), ...(route.server === undefined ? {} : { server: route.server }), layouts: route.layouts,
        pattern: route.prefix + alias.slice(1), canonical: route.pattern, ...(route.aliasOf === undefined ? {} : { aliasOf: route.aliasOf }) }, route.prefix, undefined, route.directoryLayout, route.folderLayouts);
    }
  }
  for (const prefix of Object.keys(options.layoutDefaults ?? {})) {
    if (!/^\/(?:[^/]+\/)*$/.test(prefix)) throw new MarkupKitError("Layout defaults require route-directory prefixes with leading and trailing slashes.", prefix);
  }
  const patterns = new Map<string, string>();
  for (const route of routes) {
    if (route.error) continue;
    const normalized = route.segments.map(segment => ["", "[]", "[...]", "[[...]]"][breadth(segment)] || segment.toLowerCase()).join("/");
    if (patterns.has(normalized)) throw new MarkupKitError(`Route conflict: ${patterns.get(normalized)} and ${route.component} (${route.pattern}).`, route.component);
    patterns.set(normalized, `${route.component} (${route.pattern})`);
  }
  const redirected = new Map<string, string>();
  for (const { from, component } of redirects) {
    const page = routes.find(route => !route.error && !route.notFound && route.pattern.toLowerCase() === from.toLowerCase());
    if (page !== undefined) throw new MarkupKitError(`mk:redirect-from ${from} is ${page.component === component ? "this page's own URL" : `the URL of ${page.component}`}.`, component);
    const other = redirected.get(from);
    if (other !== undefined) throw new MarkupKitError(`mk:redirect-from ${from} is declared by ${other} and ${component}.`, component);
    redirected.set(from, component);
  }
  const pageNames = new Map<string, { component: string; pattern: string; identity: string }>();
  const discovered: ApplicationRoute[] = [];
  let notFound: ApplicationRoute | undefined;
  let error: ApplicationRoute | undefined;
  const folderOrders: { readonly segments: readonly string[]; readonly rank: string }[] = [];
  const layoutDefaults = Object.entries(options.layoutDefaults ?? {}).sort(([a], [b]) => b.length - a.length);
  // A layout name is the site's layouts entry, then its app/layouts/<name>.html (the name itself),
  // then a plugin's entry, so a site overrides a plugin's layout with a file of the same name.
  const named = async (name: string): Promise<string | RouteLayer | undefined> => {
    if (options.layouts !== undefined && Object.hasOwn(options.layouts, name)) return options.layouts[name]!;
    try { await stat(resolve(root, `app/layouts/${name}.html`)); return name; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const plugins = (options as PluginOptions)[pluginLayouts];
    return plugins !== undefined && Object.hasOwn(plugins, name) ? plugins[name] : undefined;
  };
  for (const { prefix: _prefix, directoryLayout, folderLayouts, notFound: isNotFound, error: isError, index, ...route } of routes) {
    const { identity, resource } = await resourceOf(route.component, route.scope);
    const pageName = pageDefinition(resource, route.component).contract.tag;
    const previous = pageNames.get(pageName);
    if (previous !== undefined && previous.identity !== identity) {
      throw new MarkupKitError(`Duplicate page component <${pageName}>: ${previous.component} (${previous.pattern}) and ${route.component} (${route.pattern}).`, route.component);
    }
    pageNames.set(pageName, { component: route.component, pattern: route.pattern, identity });
    const metadata = resource.components.get(pageName)!;
    // An alias is a further URL for its page, so it takes the layout of the page's own URL.
    const directory = layoutDefaults.find(([prefix]) => (route.canonical ?? route.pattern).startsWith(prefix));
    let selected = metadata.layout ?? directoryLayout ?? directory?.[1] ?? options.layout;
    if (selected === undefined && route.layouts.length === 0 && await named("default") !== undefined) selected = "default";
    if (typeof selected === "string" && selected !== "none") {
      if (!/^[A-Za-z0-9_-]+$/.test(selected)) throw new MarkupKitError("Layout names must be filename slugs.", route.component);
      const found = await named(selected);
      if (found === undefined) {
        throw new MarkupKitError(`Layout ${selected} needs ${resolve(root, `app/layouts/${selected}.html`)} or a layouts entry named ${selected}.`, route.component);
      }
      if (typeof found === "object") selected = found;
    }
    let layouts = route.layouts;
    if (selected === false || selected === "none") layouts = [];
    else if (typeof selected === "object") {
      layouts = [{ component: resolve(root, selected.component),
        ...(selected.server === undefined ? {} : { server: typeof selected.server === "string" ? resolve(root, selected.server) : selected.server }) }];
    } else if (selected !== undefined) {
      const component = resolve(root, `app/layouts/${selected}.html`);
      const servers: string[] = [];
      for (const extension of ["ts", "js"]) {
        const candidate = resolve(root, `app/layouts/${selected}.server.${extension}`);
        try { await stat(candidate); servers.push(candidate); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      if (servers.length > 1) throw new MarkupKitError("Choose one layout .server.ts or .js loader.", component);
      layouts = [{ component, ...(servers[0] === undefined ? {} : { server: servers[0] }) }];
    }
    // The selected layout is outermost and folder layouts nest inside it; none drops them all.
    if (selected !== false && selected !== "none") layouts = [...layouts, ...folderLayouts];
    // mk:order takes the place of the number-and-dot prefix on the page's own last segment.
    // mk:order takes the place of the number-and-dot prefix on the page's own last segment; on a
    // folder's index page, that segment is the folder's, so it orders the folder (below).
    let order = route.order;
    if (metadata.order !== undefined && route.canonical === undefined && !isNotFound && !isError) {
      if (route.segments.length === 0) throw new MarkupKitError("mk:order on the site's home page has no folder to order; it orders a page among its folder's pages.", route.component);
      order = [...route.segments.slice(0, -1).map((_, i) => route.order?.[i] ?? null), metadata.order];
      if (index) folderOrders.push({ segments: route.segments, rank: metadata.order });
    }
    // A static <title> labels the page's folder in navigation trees when mk:label doesn't.
    const title = metadata.title;
    // The not-found page is prerendered as 404.html, and the error page renders as a build would; neither takes mk:render.
    if ((isNotFound || isError) && metadata.render !== undefined) throw new MarkupKitError(`The ${isNotFound ? "not-found" : "error"} page takes no mk:render.`, route.component);
    const discoveredRoute = { ...route, layouts, pageName, ...(order === undefined ? {} : { order }), ...(metadata.label === undefined ? {} : { label: metadata.label }),
      ...(title ? { title } : {}), ...(metadata.hidden ? { hidden: true } : {}), ...(metadata.render === "server" ? { render: "server" as const } : {}) };
    if (isNotFound) notFound = discoveredRoute;
    else if (isError) error = discoveredRoute;
    else discovered.push(discoveredRoute);
  }
  // Every page in a folder whose index page sets mk:order takes that rank for the folder's segment.
  for (const { segments, rank } of folderOrders) {
    for (const [i, route] of discovered.entries()) {
      if (route.canonical !== undefined || route.segments.length < segments.length || segments.some((segment, j) => route.segments[j] !== segment)) continue;
      const order = route.segments.map((_, j) => route.order?.[j] ?? null);
      order[segments.length - 1] = rank;
      discovered[i] = { ...route, order };
    }
  }
  return { routes: discovered, ...(notFound === undefined ? {} : { notFound }), ...(error === undefined ? {} : { error }), redirects, sources, files, watched, resourceOf };
}
/**
 * The request-time files: each app/api/**\/*.server.ts endpoint, which answers its folder path without
 * a trailing slash (index.server.ts answers the folder's own), and app/middleware.server.ts.
 */
export async function discoverServerFiles(root: string): Promise<{ readonly endpoints: readonly EndpointRoute[]; readonly middleware?: string }> {
  const endpoints: EndpointRoute[] = [];
  const patterns = new Map<string, string>();
  const visit = async (directory: string, segments: readonly string[]): Promise<void> => {
    let files;
    try { files = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
      if (file.name.startsWith(".") || file.name.startsWith("_")) continue;
      const path = join(directory, file.name);
      const stem = file.isDirectory() ? file.name : /^(.+)\.server\.(?:ts|js)$/.exec(file.name)?.[1];
      if (stem === undefined || !file.isDirectory() && !file.isFile()) continue;
      // Endpoint URLs are not pages, so a segment may name a file, as feed.xml does.
      if (stem !== "index" && parameter(stem) === undefined && !/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(stem)) {
        throw new MarkupKitError("Endpoint files and folders must be URL segments or [named] parameters.", path);
      }
      if (file.isDirectory()) { await visit(path, [...segments, stem]); continue; }
      const parts = stem === "index" ? segments : [...segments, stem];
      if (parts.slice(0, -1).some(segment => breadth(segment) > 1)) throw new MarkupKitError("A [...catch-all] parameter must be the last route segment.", path);
      const params = parts.flatMap(segment => parameter(segment) ?? []);
      if (new Set(params).size !== params.length) throw new MarkupKitError("Route parameter names must be unique.", path);
      const normalized = parts.map(segment => ["", "[]", "[...]", "[[...]]"][breadth(segment)] || segment.toLowerCase()).join("/");
      if (patterns.has(normalized)) throw new MarkupKitError(`Endpoint conflict: ${patterns.get(normalized)} and ${path}.`, path);
      patterns.set(normalized, path);
      endpoints.push({ pattern: `/${parts.join("/")}`, segments: parts, params, file: path });
    }
  };
  await visit(resolve(root, "app/api"), ["api"]);
  const middleware = ["ts", "js"].map(extension => resolve(root, `app/middleware.server.${extension}`)).filter(file => { try { return statSync(file).isFile(); } catch { return false; } });
  if (middleware.length > 1) throw new MarkupKitError("Choose one app/middleware.server.ts or .js.", resolve(root, "app"));
  return { endpoints, ...(middleware[0] === undefined ? {} : { middleware: middleware[0] }) };
}

export function matchRoute<Route extends Pick<ApplicationRoute, "pattern" | "segments">>(routes: readonly Route[], pathname: string, base: string) {
  if (!pathname.startsWith(base)) return undefined;
  let segments: string[];
  try { segments = pathname.slice(base.length).replace(/\/$/, "").split("/").filter(Boolean).map(decodeURIComponent); }
  catch { return undefined; }
  if (segments.some(segment => !validSegment(segment))) return undefined;
  // Segment by segment, a literal precedes [name], which precedes [...name], which precedes
  // [[...name]]; never depend on filesystem order.
  const sorted = [...routes].sort((a, b) => {
    for (let i = 0; i < Math.max(a.segments.length, b.segments.length); i++) {
      const difference = breadth(a.segments[i]) - breadth(b.segments[i]);
      if (difference !== 0) return difference;
    }
    return a.pattern.localeCompare(b.pattern);
  });
  for (const route of sorted) {
    // A catch-all takes the remaining segments: at least one, or any number for [[...name]].
    const rest = Math.max(0, breadth(route.segments.at(-1)) - 1);
    const fixed = rest === 0 ? route.segments.length : route.segments.length - 1;
    if (rest === 0 ? segments.length !== fixed : segments.length < fixed + 2 - rest) continue;
    const params: Record<string, string | readonly string[]> = {};
    if (route.segments.slice(0, fixed).every((segment, index) => {
      const name = parameter(segment);
      if (name === undefined) return segment === segments[index];
      params[name] = segments[index]!;
      return true;
    })) {
      if (rest > 0) params[parameter(route.segments.at(-1)!)!] = Object.freeze(segments.slice(fixed));
      return { route, params: Object.freeze(params) };
    }
  }
  return undefined;
}

/** Shared declaration discovery for rendering and independent build targets; no application modules execute. */
export async function discoverApplication(input: ApplicationOptions = {}) {
  const options = await withPlugins(input);
  const config = configure(options);
  const option = redirectTable(config.base, options.redirects);
  const discovery = await discover(config.root, { ...options, base: config.base });
  const { routes, redirects: declared } = discovery;
  // Pages' mk:redirect-from entries join the redirects option's, rediscovered with the pages.
  const redirects = new Map(option);
  // Each page redirect's deployment path, for the declaring page's diagnostics.
  const pageRedirects = new Map<string, { readonly from: string; readonly component: string }>();
  for (const { from, to, component } of declared) {
    const path = new URL(config.base + from.slice(1), "http://localhost").pathname;
    if (option.has(path)) throw new MarkupKitError(`mk:redirect-from ${from} is also a key of the redirects option.`, component);
    redirects.set(path, config.base + to.slice(1));
    pageRedirects.set(path, { from, component });
  }
  // Alias pages name their own URL canonical, absolute when the site sets its origin.
  const canonicalOrigin = options.origin === undefined ? "" : config.origin;
  const server = await discoverServerFiles(config.root);
  // A dynamic page's entries are checked the same way when they are listed.
  const shadowed = routes.find(route => route.params.length === 0 && redirects.has(config.base + route.pattern.slice(1)));
  if (shadowed !== undefined) throw new MarkupKitError(`The redirects option also redirects ${shadowed.pattern}, which is this page's URL.`, shadowed.component);
  return { options, config, discovery, server, redirects, pageRedirects, canonicalOrigin };
}

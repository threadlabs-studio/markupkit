import { existsSync } from "node:fs";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import { checkPolicyOptions } from "./csp.js";
import type { ApplicationOptions, MarkupKitPlugin, RouteLayer } from "./types.js";

/**
 * The options markupkit.config.ts (or .js) at root exports by default, loaded through Vite as the CLI
 * loads them; {} without a config file.
 */
export async function loadConfig(root = process.cwd()): Promise<ApplicationOptions> {
  const files = ["ts", "js"].map(ext => resolve(root, `markupkit.config.${ext}`)).filter(existsSync);
  if (files.length > 1) throw new MarkupKitError("Choose one markupkit.config.ts or .js.", resolve(root));
  if (files[0] === undefined) return {};
  // Loaded here, so the request server, which shares this module, runs without Vite.
  const { createServer } = await import("vite");
  const loader = await createServer({ root: resolve(root), configFile: false, appType: "custom", logLevel: "silent",
    server: { middlewareMode: true, watch: null, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  let configured: unknown;
  try { configured = (await loader.ssrLoadModule(files[0])).default; }
  finally { await loader.close(); }
  if (configured === null || typeof configured !== "object") throw new MarkupKitError("Configuration must export a default ApplicationOptions object.", files[0]);
  return configured as ApplicationOptions;
}

/**
 * Vite options for every module server and bundle: browser code reads only PUBLIC_ variables, as
 * import.meta.env.PUBLIC_NAME, and they come from process.env, which loadEnvironment fills.
 */
export const publicEnvironment = { envDir: false, envPrefix: "PUBLIC_" } as const;

/**
 * The markupkit command loads root's .env files into process.env. The most specific file loads first
 * and Node never replaces a variable already set, so the shell wins over .env.<mode>.local, then
 * .env.<mode>, .env.local and .env.
 */
export function loadEnvironment(root: string, mode: "development" | "production"): void {
  for (const file of [`.env.${mode}.local`, `.env.${mode}`, ".env.local", ".env"]) {
    const path = resolve(root, file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

export class MarkupKitError extends Error {
  constructor(message: string, readonly source?: string) {
    super(source === undefined ? message : `${source}: ${message}`);
    this.name = "MarkupKitError";
  }
}
export function within(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}
export function configure(options: ApplicationOptions) {
  // Removed with the always-on 01. ordering; name that rather than quietly move pages to /01-guide/.
  if ("routeOrdering" in options) throw new MarkupKitError("The routeOrdering option was removed: a number and a dot (01.guide/) always orders pages.");
  const root = resolve(options.root ?? process.cwd());
  const base = options.base ?? "/";
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new MarkupKitError("base must be an absolute path with a trailing slash, for example /docs/.");
  const origin = new URL(options.origin ?? "http://localhost");
  if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new MarkupKitError("origin must be an HTTP(S) origin without a path, credentials, query, or fragment.");
  }
  const outDir = resolve(root, options.outDir ?? "dist");
  // A failed build must never erase source, the application, or its dependencies.
  if (within(outDir, root) || ["app", "src", "public", "node_modules", ".git"].some(path => within(resolve(root, path), outDir))) {
    throw new MarkupKitError("Unsafe output directory; choose dist or a separate deployment directory.", outDir);
  }
  const prefetch = options.prefetch ?? "interaction";
  if (!["interaction", "visible", "none"].includes(prefetch)) throw new MarkupKitError('prefetch must be "interaction", "visible", or "none".');
  if (![undefined, "error", "warn"].includes(options.linkCheck)) throw new MarkupKitError('linkCheck must be "error" or "warn".');
  if (!["undefined", "boolean", "string"].includes(typeof options.robots)) throw new MarkupKitError("robots must be true, false, or the text of robots.txt.");
  return { root, base, origin: origin.origin, outDir, prefetch, csp: checkPolicyOptions(options.csp) };
}

/** Plugins' named layouts, kept apart from the site's: a site's app/layouts/<name>.html wins over them. */
export const pluginLayouts = Symbol("markupkit.pluginLayouts");
export type PluginOptions = ApplicationOptions & { readonly [pluginLayouts]?: Readonly<Record<string, RouteLayer>> };

const pluginsApplied = new WeakSet<ApplicationOptions>();
/** Merge each plugin's config() once; options already merged pass through, so nested entry points don't repeat hooks. */
export async function withPlugins(options: ApplicationOptions): Promise<ApplicationOptions> {
  if (pluginsApplied.has(options) || options.plugins === undefined) return options;
  let merged: PluginOptions = options;
  for (const plugin of options.plugins) {
    const { layouts, ...added } = await plugin.config?.(merged) ?? {};
    // Page folders, stylesheets, and routes add to the application's own; app/pages stays the default folder.
    merged = { ...merged, ...added, plugins: options.plugins,
      ...(added.pages === undefined ? {} : { pages: [...merged.pages ?? [{ dir: "app/pages", optional: true }], ...added.pages] }),
      ...(added.imports === undefined ? {} : { imports: { ...added.imports, ...merged.imports } }),
      ...(added.css === undefined ? {} : { css: [...merged.css ?? [], ...added.css] }),
      // An earlier plugin's named layout wins over a later plugin's of the same name.
      ...(layouts === undefined ? {} : { [pluginLayouts]: { ...layouts, ...merged[pluginLayouts] } }),
      ...(added.routes === undefined ? {} : { routes: [...merged.routes ?? [], ...added.routes] }) };
  }
  merged = { ...merged };
  pluginsApplied.add(merged);
  return merged;
}

/** Run each plugin's hook in order; a failure names the plugin and the hook. */
export async function runHook<Hook extends "buildStart" | "buildEnd">(options: ApplicationOptions, hook: Hook,
  context: Parameters<NonNullable<MarkupKitPlugin[Hook]>>[0]): Promise<void> {
  for (const plugin of options.plugins ?? []) {
    try { await (plugin[hook] as ((context: unknown) => unknown) | undefined)?.call(plugin, context); }
    catch (error) {
      const failure = new MarkupKitError(`Plugin ${plugin.name} failed in ${hook}: ${error instanceof Error ? error.message : String(error)}`);
      failure.cause = error;
      throw failure;
    }
  }
}

/** Vite's side of the import map's @/ entry, for loaders, controllers, and stylesheets. */
export function rootAlias(root: string) {
  // Vite's normalizePath.
  return [{ find: /^@\//, replacement: posix.normalize(root.replaceAll("\\", "/")) + "/" }];
}

/** The application's global stylesheets as absolute paths. */
export function globalStylesheets(options: ApplicationOptions, root: string): readonly string[] {
  return (options.css ?? []).map(path => resolve(root, path.startsWith("@/") ? path.slice(2) : path));
}

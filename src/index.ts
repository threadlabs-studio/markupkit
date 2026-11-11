export { createApplication } from "./application.js";
export { buildApplication, readManifest } from "./build.js";
export { devApplication, previewApplication } from "./serve.js";
export { startApplication } from "./server.js";
export type { ServerReader, ServerReaders, ServerReadContext } from "./private-readers.js";
export type { ComponentBindingDefinition, ComponentBindingModule } from "./component-module.js";
export { discoverRoutes } from "./routes.js";
export { MarkupKitError, loadConfig } from "./config.js";
import type { ApplicationOptions } from "./types.js";
/** Type-check an markupkit.config.ts file without changing its values. */
export function defineConfig(options: ApplicationOptions): ApplicationOptions { return options; }
export type { Application, ApplicationOptions, ApplicationRoute, ApplicationServer, BrowserDefinition, BuildEndContext, BuildManifest, BuildResult, BuildStartContext, ContentSecurityPolicyOptions,
  EndpointContext, EndpointHandler, EndpointModule, EndpointRoute, GenerateContext, GeneratedFile, MarkupKitPlugin, PageAction, PageContext, PageSource, PageDirectory, LoadContext, Loader, LoaderResult, ManifestFile, ManifestPage,
  ManifestRedirect, Middleware, NavigationItem, NavigationNode, NavigationQuery, PagerLinks, PageHead, PrefetchPolicy, RedirectStatus, RenderedHead, RenderedLayer, RenderedPolicy,
  RenderedPage, RouteGroup, RouteInput, RouteLayer, RouteParam, ServerApplication, ServerModule, ServerOptions, StartOptions } from "./types.js";

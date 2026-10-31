import { compiledPageURL, discoverApplication } from "./routes.js";
import { pageDefinition } from "./resource.js";
import type { ApplicationOptions, ApplicationRoute, EndpointRoute, RouteLayer } from "./types.js";

/** A declaration reference, never an imported or serialized server module. */
export type ApplicationServerReference = { readonly kind: "file"; readonly file: string } | { readonly kind: "inline" };
export interface ApplicationDescriptionLayer extends Omit<RouteLayer, "server"> {
  readonly server?: ApplicationServerReference;
}
export interface ApplicationDescriptionRoute extends Omit<ApplicationRoute, "server" | "layouts"> {
  readonly server?: ApplicationServerReference;
  readonly layouts: readonly ApplicationDescriptionLayer[];
}
export interface ApplicationDescriptionSource {
  readonly file: string;
  /** Present for a plugin page compiled in a named source scope. */
  readonly scope?: string;
  /** HTML Next source after an explicitly configured page compiler, before presentation lowering. */
  readonly source: string;
  readonly tag: string;
  /** The selected component's authored module specifier. Server route exports are referenced separately. */
  readonly module?: string;
}
/** Build-time source inventory. Contains private paths/source; never ship it to a browser or native app. */
export interface ApplicationDescription {
  readonly version: 1;
  readonly root: string;
  readonly base: string;
  readonly routes: readonly ApplicationDescriptionRoute[];
  readonly notFound?: ApplicationDescriptionRoute;
  readonly error?: ApplicationDescriptionRoute;
  readonly sources: readonly ApplicationDescriptionSource[];
  /** Deployment-relative asset names mapped to original files registered by page compilers. */
  readonly assets: Readonly<Record<string, string>>;
  readonly endpoints: readonly EndpointRoute[];
  readonly middleware?: string;
  readonly redirects: Readonly<Record<string, string>>;
}
function layer<T extends RouteLayer>({ server, ...value }: T): Omit<T, "server"> & { readonly server?: ApplicationServerReference } {
  return { ...value, ...server === undefined ? {} : { server: typeof server === "string" ? { kind: "file" as const, file: server } : { kind: "inline" as const } } };
}
function route({ layouts, ...value }: ApplicationRoute): ApplicationDescriptionRoute {
  return { ...layer(value), layouts: layouts.map(layer) };
}

/**
 * Describe the same declarations web discovery consumes. Explicit plugin config/page hooks run;
 * page/layout modules, loaders, entries, endpoints and middleware do not. Configuration-file loading
 * remains the caller's explicit operation through loadConfig().
 */
export async function describeApplication(input: ApplicationOptions = {}): Promise<ApplicationDescription> {
  const { config, discovery, server, redirects } = await discoverApplication(input);
  const all = [...discovery.routes, ...discovery.notFound === undefined ? [] : [discovery.notFound], ...discovery.error === undefined ? [] : [discovery.error]];
  const paths = new Map<string, { file: string; scope?: string }>();
  for (const page of all) for (const value of [...page.layouts, page]) {
    const scope = value === page ? page.scope : undefined;
    const url = compiledPageURL(value.component, scope, discovery.sources);
    paths.set(url, { file: value.component, ...(scope !== undefined && new URL(url).search !== "" ? { scope } : {}) });
  }
  return { version: 1, root: config.root, base: config.base, routes: discovery.routes.map(route),
    ...discovery.notFound === undefined ? {} : { notFound: route(discovery.notFound) },
    ...discovery.error === undefined ? {} : { error: route(discovery.error) },
    sources: await Promise.all([...paths.values()].map(async ({ file, scope }) => {
      const snapshot = await discovery.resourceOf(file, scope);
      const definition = pageDefinition(snapshot.resource, file);
      return { file, ...(scope === undefined ? {} : { scope }), source: snapshot.source, tag: definition.contract.tag,
        ...definition.module === undefined ? {} : { module: definition.module } };
    })), assets: Object.fromEntries(discovery.files), ...server, redirects: Object.fromEntries(redirects) };
}

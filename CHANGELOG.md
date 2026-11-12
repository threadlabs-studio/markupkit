# Changelog

## 0.8.1

- `markupkit dev` shows a failure's file, line, and column, the source lines around it, and the stack on its error page, and prints the location in the terminal. A failed `markupkit build` prints the location under the error. Locations come from HTML Next diagnostics for templates and from the source-mapped stack for loaders and other modules. A build reads a failure's stack before it closes its loaders, while their source maps are still loaded, so the line is the source's.

## 0.8.0

- Load `.env`, `.env.local`, `.env.<mode>` and `.env.<mode>.local` into `process.env` for every `markupkit` command, with the shell's variables winning. Browser code reads `PUBLIC_` variables as `import.meta.env.PUBLIC_NAME`; no other variable reaches a browser bundle.

## 0.7.1

- Accept Node releases after 24, including Node 26. Node 22 remains supported from 22.22.2.

## 0.7.0

- `markupkit dev` updates open pages in place when a component, page, layout definition, Markdown or data file changes. Each changed component module is imported again and replaces its definition. Every instance re-renders with its props and slotted content, and it and every component it renders keep each state the new definitions still declare. Layers take their new props and changed stylesheets load again, with scroll and every other component unchanged. A change to a controller or another browser module, or to which layouts a page uses, reloads the page.
- Require HTML Next 1.0.0-alpha.87, whose `replaceComponent` development output these updates use. The range records that API requirement.

## 0.6.1

- Let applications and plugins supply component/controller import-map entries. A documentation tool can resolve its own package resources without requiring a direct dependency in the consuming project.

## 0.6.0

- Navigation queries accept `exclude` to omit mounted subtrees consistently from flat lists, trees, breadcrumbs and previous/next links.
- Allow dotted URL slugs and page-directory prefixes, including historical documentation paths such as `/v/1.2.3/`. Relative directory segments remain invalid.

## 0.5.0

- Read canonical `component` identities during preparation and client navigation, with the legacy-root precedence defined by HTML Next. Qualify installed consumers against the current alpha.81 runtime while preserving the supported minimum.

- Serve plugin pages in named directory scopes with separate compiled identities and links resolved inside each scope. Select mounted files before compilation through an asynchronous `include` callback and an immutable candidate source catalog. Keep relative imports and assets beside their original sources, preserve alias canonical ownership, and describe each scoped compilation independently.

## 0.4.3

- Prepare library-owned component bindings that export the existing `connect`, `prepare` and `adopt` functions. Initial connection and rendered navigation retain matching server read identities, preserve caller values and avoid repeating accepted reads. Environment provider overrides require a raw `props` or `create` module.
- Keep Vite dependency optimization enabled in development so transitive CommonJS dependencies load correctly.

## 0.4.2

- Require HTML Next alpha.71’s corrected compiled projection/hydration behavior for component consumers. Admit newer HTML Next, Markupress and Looma releases through minimum-version ranges without a 1.0 or later major-version ceiling. The lockfile records the exact verified runtime and docs graph.

## 0.4.1

- Support alternate-language head links that share a URL, including a language and x-default, through HTML Next alpha.70.

## 0.4.0

- Expose immutable static page-source mounts to page compilers, including native alias-directory targets and deployment bases. Metadata caches can use the shared catalog identity and refresh on each discovery in development.

## 0.3.0

- Support native document direction through loader `head.dir`, initial/static HTML, navigation payloads and in-place browser adoption. Pages inherit their layout direction, can override it, and clear a preceding page's direction when no loader sets one.

## 0.2.2

- Restore the published `mk:` page metadata, `mk-` navigation components and `data-mk-` browser contract. Version 0.2.1 reverted these names to `hk`, breaking consumers such as Markupress.

## 0.2.1

- Build the documentation website with the Markupress CLI and Expressmark standard table syntax.

## 0.1.0

- HTML components, file-based routes, shared layouts, and typed data.
- Prerendered pages, request-time rendering, API endpoints, and middleware.
- Development tools and browser navigation, powered by HTML Next.

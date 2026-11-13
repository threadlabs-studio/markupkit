---
title: Limitations
order: 11
description: what MarkupKit leaves to the host, the browser and later releases
---

# Limitations

MarkupKit covers routing, data loading, forms, rendering and deployment for content and interactive
sites. These needs are handled another way, or arrive in a later release:

::: table {header}

- Need: Caching and revalidation
  Today: A page is prerendered once per build or rendered on each request. Set `Cache-Control` from a loader or [middleware](/server) so a CDN caches server pages. Per-route cache rules and time-based revalidation of prerendered pages are planned for 1.1.

- Need: Streaming
  Today: Each response is sent once its loaders finish. [Loading state](/client-navigation#showing-that-a-page-is-loading) covers navigations that wait.

- Need: Host adapters
  Today: Static output deploys to any static host, and the request server runs on [Node, Deno and Bun](/deployment). Adapters for Vercel, Netlify and Cloudflare are planned for 1.1.

- Need: Images and fonts
  Today: Put files in `public/` ([Styles and assets](/styling)) and use the browser's own tools: `srcset`, `sizes`, `loading="lazy"` and `font-display`.

- Need: Localized routes
  Today: Give each language its own folder of pages, and link the versions with `alternate` head links and `hreflang`.

- Need: Parallel and intercepting routes
  Today: Compose a page from components and layouts; a dialog over a page is a component on that page.

- Need: Auto-imports
  Today: Import what a module uses. Components resolve through `@/` and the [import map](/configuration).

:::

---
title: Getting started
description: Install MarkupKit and build your first HTML page.
---

# Get back to building with HTML.

Write your pages in HTML, your styles in CSS, and your behavior in JavaScript. MarkupKit turns a folder of [HTML Next](https://nextwebwg.org/html-next/) components into a website. Each file in
`app/pages` is a page and layouts wrap pages. Components receive typed props from ordinary values,
shared providers, browser readers, or private server readers. Pages render at
build time or on each request, and `app/api` files answer requests with JSON or anything else.
`markupkit build` writes prerendered pages and a server that `markupkit start` runs. Pages whose browser
reads use only public sources can also deploy to a static host.

## Get started

Use Node 22 (22.22.2 or later) or Node 24 (24.15 or later). Install MarkupKit and add its commands to `package.json`:

```sh
npm install @threadlabs/markupkit
```

```json
{
  "type": "module",
  "scripts": {
    "dev": "markupkit dev",
    "build": "markupkit build",
    "preview": "markupkit preview",
    "start": "markupkit start"
  }
}
```

Create your first page:

```html
<!-- app/pages/index.html -->
<template component="page-home">
  <defs><title>Hello</title></defs>
  <main>
    <h1>Hello, MarkupKit</h1>
  </main>
</template>
```

Run `npm run dev` and open the URL it prints. Edit the page and it updates in place, keeping its scroll position and component state.

## A project at a glance

```text
app/
  pages/          one file per page; the folder structure is the URL structure
  layouts/        shared shells, such as default.html
  api/            endpoints, such as todos.server.ts at /api/todos
  middleware.server.ts  optional code that runs before every page and endpoint
  components/     your own components (a convention; link them with href="@/app/components/…")
  head.js         optional script that runs before the page first paints
public/           files copied as-is, such as favicon.ico
markupkit.config.ts optional settings
```

## Deploy

`npm run build` writes the site to `dist/`. When every page is prerendered, upload that folder to any
static host, and set the host's "page not found" response to `404.html` (your
[not-found page](/routes#the-not-found-page), when `app/pages/404.html` exists).
`npm run preview` serves `dist/` locally first. A site with pages that render on each request,
endpoints, or middleware runs `npm start` on Node, or the same server on Deno or Bun; see
[deployment](/deployment). The build checks each link to the site's own pages and fails on
one that leads to a missing page or anchor ([link check](/configuration#link-check)). With an
`origin`, it also writes [`sitemap.xml`](/configuration#search-engines).

The commands take an optional project folder (`markupkit dev site`), `--base /docs/` to serve the site
under a path, `--origin` for absolute URLs, `--out-dir`, `--port`, and `--host`. Flags override the
same settings in `markupkit.config.ts`. The servers listen on 127.0.0.1, port 3000, unless you pass
`--host` or `--port`. `preview` and `start` take the base path from the build, so build with the
`--base` you deploy under. The [command line reference](/configuration#command-line) lists
every command and option.

## Next steps

::: table

- To…: Add pages, dynamic URLs, and layouts
  Read: [Pages and routing](/routes)

- To…: Load data into a page, at build time or on each request
  Read: [Loading data](/loaders)

- To…: Answer API requests, or run code before every request
  Read: [Endpoints and middleware](/server)

- To…: Accept form submissions, with validation errors
  Read: [Forms](/forms)

- To…: Put the site online
  Read: [Deployment](/deployment)

- To…: Add site navigation and order pages
  Read: [Navigation](/navigation)

- To…: Move between pages without reloading
  Read: [Moving between pages](/client-navigation)

- To…: Change settings, use plugins, or call MarkupKit from code
  Read: [Configuration](/configuration)

:::

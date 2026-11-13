---
title: Error messages
order: 10
description: where errors appear · reading a message · common messages and their fixes
---

# Error messages

Every MarkupKit error names the file it is about and says what to change. This page shows where
errors appear and lists the ones you are most likely to meet.

## Where errors appear

::: table

- Where: `markupkit dev`
  What you see: A failing page answers 500 with the error, the file, line and column it came from, the source lines around it, and the stack. The terminal prints the same location.

- Where: `markupkit build`
  What you see: The build stops with the error and, under it, the source line, such as `at app/pages/team.server.ts:3:33`. The previous `dist/` stays.

- Where: `markupkit start` and `application.fetch`
  What you see: The reader gets [`app/error.html`](/routes#the-error-page) with status 500, and the error and its stack go to the server's console.

:::

A loader that calls `notFound()` or `redirect()` isn't failing: it answers 404 or redirects, as
[Loading data](/loaders#redirecting) describes.

## Reading a message

```text
/site/app/pages/team.server.ts: load() must return a LoaderResult object.
```

The file comes first, then the problem. When the error is thrown from your own code, `markupkit dev` and
`markupkit build` add the failing line. Messages about component markup come from HTML Next and start
with a code, such as `HT001: A component's markup must be exactly one element root.` The code names the
rule in the [HTML Next proposal](https://nextwebwg.org/declarative-components/).

## Common messages

### Pages and routes

::: table

- Message: `A component's markup must be exactly one element root.` (`HT001`)
  Fix: Wrap the page's markup in one element, such as `<main>`.

- Message: `<link rel="component"> is not a head declaration.` (`HC025`)
  Fix: Put component links before the `<template>`, not inside `<defs>`.

- Message: `Layout requires a slot named "page".`
  Fix: Add `<slot name="page"></slot>` where the layout shows its page.

- Message: `Layout … needs app/layouts/….html or a layouts entry named ….`
  Fix: Create the layout file, or fix the name in `mk:layout`, `layout` or `layoutDefaults`.

- Message: `Route conflict: … and ….`
  Fix: Two files serve one URL, such as `about.html` and `about/index.html`. Remove or rename one.

- Message: `Route directories must be URL slugs, [named] parameters, or (groups).`
  Fix: Rename the folder to a URL slug, a `[param]` or a `(group)`; see [Pages and routing](/routes).

- Message: `A [...catch-all] parameter must be the last route segment.`
  Fix: Move the catch-all to the end of the path.

- Message: `Duplicate page component <…>: … and ….`
  Fix: Give each page's `<template component>` its own name.

:::

### Loaders and actions

::: table

- Message: `load() must return a LoaderResult object.`
  Fix: Return an object, such as `{ props: { … } }`, or `{}` when the page needs no data.

- Message: `request is unavailable while prerendering; <meta name="mk:render" content="server"> renders the page on each request.`
  Fix: The page is built ahead of time, so it has no request. Render it on each request, or stop reading `request` and `cookies`.

- Message: `Static entries() must enumerate parameters: ….`
  Fix: A prerendered page with `[params]` exports `entries()` listing its values, or renders on each request.

- Message: `Each entry must provide exactly these parameters: ….`
  Fix: Give each item `entries()` returns every parameter in the route, and nothing else.

- Message: `A loader's head sets only lang and dir; …`
  Fix: Declare `<title>` and `<meta>` in the page's `<defs>`, bound to props the loader returns.

- Message: `An action returns nothing, which redirects to its page, or an object of the page's props.`
  Fix: Return nothing, or the props to show, such as `{ errors, values }`.

:::

### Endpoints and middleware

::: table

- Message: `GET must return a Response.` (or another method)
  Fix: Return a `Response`, such as `Response.json(data)`.

- Message: `Middleware must return a Response, such as next()'s.`
  Fix: Return `next()`'s result, or a `Response` of your own.

- Message: `Choose one app/middleware.server.ts or .js.`
  Fix: Keep one middleware file.

:::

### Builds and the server

::: table

- Message: `Broken internal links:` followed by `… links to …, which is no page or file in the build.`
  Fix: Fix the link, or set [`linkCheck`](/configuration#link-check) to `warn` while you do.

- Message: `… links to …, and … has no element with id "…".`
  Fix: The page exists but its anchor doesn't. Fix the `#fragment` or add the `id`.

- Message: `Public asset collision with route ….`
  Fix: A file in `public/` has a page's URL. Rename or remove one.

- Message: `Refusing to replace nonempty output without a MarkupKit build manifest.`
  Fix: `outDir` holds files MarkupKit didn't write. Choose an empty directory, or remove its contents yourself.

- Message: `No server entry; run markupkit build first.`
  Fix: Run `markupkit build` before `markupkit start`.

:::

### Configuration

::: table

- Message: `base must be an absolute path with a trailing slash, for example /docs/.`
  Fix: Write `base: '/docs/'`.

- Message: `origin must be an HTTP(S) origin without a path, credentials, query, or fragment.`
  Fix: Write `origin: 'https://example.com'`.

- Message: `csp["…"] must be a list of CSP source expressions, …`
  Fix: Give each directive a list, such as `{ 'img-src': ['https://cdn.example'] }`.

:::

## Content Security Policy reports

In `markupkit dev`, a script or resource the page's [Content Security Policy](/configuration#content-security-policy)
blocks is reported in the terminal with the config line that allows it:

```text
MarkupKit: /pricing/ blocked https://js.stripe.com/v3 under script-src. To allow it, add to markupkit.config.ts: …
```

Add the line only for sources you trust.

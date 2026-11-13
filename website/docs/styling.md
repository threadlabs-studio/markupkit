---
title: Styles and assets
order: 6
description: component styles · page-wide stylesheets · images and fonts · public/ · base paths
---

# Styles and assets

Each component styles itself in its own `<style>`. Rules for the whole page, such as `html` and `body`,
go in page-wide stylesheets. Files the browser loads as they are, such as icons, go in `public/`.

## Component styles

A component's `<style>` applies only to that component:

```html
<!-- app/components/card.html -->
<template component="ui-card">
  <div class="card"><slot></slot></div>
  <style>
    :host { display: block; }
    .card { padding: 1rem; border: 1px solid var(--line); }
  </style>
</template>
```

- `:host` is the component's own root element.
- A rule stops at the components it renders, so `.card` here never reaches a `.card` inside another
  component.
- Content passed into a slot belongs to the component that wrote it, and that component's styles
  apply to it.
- A page and a layout are components too, so their `<style>` works the same way.

MarkupKit compiles these rules to CSS `@scope`, and the browser applies them. No class names are
rewritten.

## Page-wide stylesheets

List stylesheets for the whole site in the `css` option:

```ts
// markupkit.config.ts
export default defineConfig({ css: ['@/app/styles/page.css'] });
```

```css
/* app/styles/page.css */
@import '@/app/styles/tokens.css';
@import 'some-ui-package';

body { margin: 0; font-family: system-ui, sans-serif; }
```

- `@import` takes a relative path, a `@/` path, or a package name. A package's stylesheet comes from its
  `style` field.
- Custom properties set here, such as `--line` on `:root`, reach every component.
- The build bundles each page's page-wide and component styles into hashed stylesheets under
  `_markupkit/`, and the page loads them before it is shown.

## Images and fonts in CSS

A `url()` in any stylesheet, a component's `<style>` included, is resolved from the stylesheet's own
file:

```css
@font-face {
  font-family: Brand;
  src: url('./fonts/brand.woff2') format('woff2');
  font-display: swap;
}
.hero { background: url('./hero.jpg') center / cover; }
```

The build copies each file under `_markupkit/` with a hashed name, so a changed file gets a new URL,
and writes the URL with the site's base path. Files under 4 KB are inlined as `data:` URLs.

## Files in `public/`

Files in `public/` are copied to the site unchanged, at the same path: `public/favicon.svg` is served
at `/favicon.svg`. Use it for files referenced from HTML, such as `<img src>`, icons and downloads.

```html
<img src="/images/team.jpg" alt="The team" width="800" height="600">
```

- A `src` or `href` in a component's HTML is used as written. A relative `src="./logo.png"` is resolved
  against the page's URL, not the component's file, so put images in `public/` and use an absolute
  path.
- `public/` files keep their names, so browsers cache them by the host's rules. Change a file's name
  when its contents change.
- Responsive images and font loading use standard HTML: `srcset`, `sizes`, `loading="lazy"`,
  `<link rel="preload">` and `font-display`. MarkupKit doesn't resize or convert images.
- A symbolic link in `public/` is an error. `_markupkit/`, `404.html`, and `robots.txt` when the
  [`robots` option](/configuration#search-engines) is set are reserved.

## Under a base path

With `base: '/docs/'`, stylesheet URLs get the base automatically. Paths in HTML don't, so write the
full path, `/docs/images/team.jpg`, or build it from the loader's `base`:

```ts
// app/pages/about.server.ts
import type { Loader } from '@threadlabs/markupkit';

export const load = (({ base }) => ({ props: { team: `${base}images/team.jpg` } })) satisfies Loader;
```

```html
<img from:src="$team" alt="The team">
```

## In development

`markupkit dev` updates a changed stylesheet in place, without reloading the page, and keeps each
component's state. Component styles from pages you have visited stay loaded until the next full
reload; built sites remove a page's styles when you leave it.

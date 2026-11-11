---
title: Moving between pages
order: 7
description: client navigation · prefetch · opt-outs
---

# Moving between pages

Links between your pages are ordinary links:

```html
<a href="/guide/install/">Install</a>
```

Once the first page has loaded, clicking one doesn't reload the browser tab. MarkupKit loads the
next page's code and a small file of its data, builds the page in the browser, keeps the layout both
pages share, and swaps in the new page. There's nothing to set up.

## What stays and what changes

::: table

- Part of the page: A layout both pages use
  When you move to another page: Stays, with its state and module instance. An open menu stays open.

- Part of the page: That layout's props
  When you move to another page: Update from its loader. `<mk-nav>` marks the new page current.

- Part of the page: That layout's providers
  When you move to another page: A changed selected input adopts compatible prepared data without repeating the read. An existing read for the same input stays current.

- Part of the page: The page, and any layout only one page uses
  When you move to another page: Replaced. A fresh page starts from its loader's state.

- Part of the page: `<title>`, description, and other head declarations
  When you move to another page: Update to the new page's in one step, also inside a view transition.

- Part of the page: Declared scripts
  When you move to another page: Stay loaded. A script the next page declares loads once; none runs twice.

- Part of the page: Scroll position
  When you move to another page: Top of the page, or the `#fragment` in the link. Back and forward return to where you were.

- Part of the page: Keyboard focus
  When you move to another page: Starts from the top, as after a page load.

:::

Screen readers hear the new page's title. Back, forward, and reload work as usual, and every URL
still loads directly.

Provider adoption keeps edited drafts and does not reconnect a retained layout. Its current browser
values, subscriptions, pending reads, and handled failures remain authoritative for the same selected
input, so returning to cached prerendered HTML does not replace newer live data. Change a selected
input or explicitly refresh when the data should be read again.

## Links that load the whole page

These links load normally, as they would without MarkupKit:

::: table

- Link: Another site
  Example: `<a href="https://example.com/">`

- Link: Outside the app's base path
  Example: `/elsewhere/` when the base is `/docs/`

- Link: A file rather than a page
  Example: `<a href="/report.pdf">`

- Link: A download, or a new tab or window
  Example: `download`, `target="_blank"`, or Ctrl, ⌘, Shift, or middle click

- Link: A `#fragment` on the same page
  Example: `<a href="#install">`

- Link: Marked with `data-mk-reload`
  Example: `<a href="/print/" data-mk-reload>`

:::

Forms submit in place as well: a `GET` form loads its page with the form's query, and a
[form that posts](/forms#submitting-in-place) runs its page's action.

Put `data-mk-reload` on a link, or on an element around several links, to load those pages in full:

```html
<nav data-mk-reload>
  <a href="/legacy/">Legacy reports</a>
  <a href="/admin/">Admin</a>
</nav>
```

A page that defines a component differently from one already on the screen, such as an archived
docs version's own copy of a component, loads in full: one page can't hold both definitions. Back
and forward move between the two pages as usual.

If a page's data file can't be used, MarkupKit fetches the page's HTML instead. If that can't be
shown in place either, because the page is missing or the request fails, the page loads in full.

## Faster clicks

When the pointer rests on a link, the link gets keyboard focus, or a finger touches it, MarkupKit
starts loading that page's code and data. By the click, it's usually ready. Moving across a menu
fetches nothing. Links on screen only load code that several pages share, never a page's own
content, so a long sidebar stays cheap.

Choose a different policy for the whole site in `markupkit.config.ts`:

```ts
export default defineConfig({ prefetch: 'visible' });
```

Or for one link, or every link inside an element:

```html
<a href="/big-report/" data-mk-prefetch="none">Big report</a>
<nav data-mk-prefetch="visible">…</nav>
```

::: table {header}

- - `prefetch` / `data-mk-prefetch`
  - Link on screen
  - Hover, focus, or touch

- - `interaction` (default)
  - Shared code
  - The page's code and data

- - `visible`
  - The page's code and data
  - The page's code and data

- - `none`
  - Nothing
  - Nothing

:::

`visible` suits small sites. Prefetching never runs a page's code in the browser; it only downloads
it. For a page that [renders on each request](/loaders#rendering-on-each-request), loading its
data runs its loaders on the server, with the link's query and the reader's cookies, as loading the
page does. Give links to such pages `data-mk-prefetch="none"` when their loaders are costly.

## Animating the change

Add the rule browsers use for animated page loads, and MarkupKit animates client navigation with it
too:

```css
@media (prefers-reduced-motion: no-preference) {
  @view-transition { navigation: auto; }
}
```

The default is a cross-fade. Style `::view-transition-old(root)` and `::view-transition-new(root)`
to change it. Firefox loads pages without the animation.

## Showing that a page is loading

While a page loads in place, `<html>` has `data-mk-navigating`. While a
[form submits in place](/forms#submitting-in-place), the form also has
`data-mk-submitting` and `aria-busy="true"`. Both go when the next page has rendered, or when the
navigation fails or another replaces it. Show a pending indicator with CSS:

```css
.progress { opacity: 0; }
/* Shown after 150 ms, so a quick navigation shows nothing. */
:root[data-mk-navigating] .progress { opacity: 1; transition: opacity 200ms 150ms; }
form[data-mk-submitting] button { cursor: progress; opacity: 0.6; }
```

`aria-busy` tells screen readers the form is changing, and they hear the next page's title once it
renders, so an indicator needs no announcement of its own. Scripts read the browser's own state:
`navigation.transition` is set while a navigation is under way, and `navigatesuccess` and
`navigateerror` fire when it ends.

## Loading a page's data again

To show a page's latest data, for example after a script changes it through an
[endpoint](/server#endpoints), reload the page from a script:

```js
await fetch('/api/todos/', { method: 'POST', body });
location.reload();
```

MarkupKit runs the page's loaders and its layouts' again and gives each its new props in place. The
page and its layouts keep their state, what the reader has typed, focus and scroll, as a layout
does between pages, and the reload ignores prefetched and HTTP-cached data. `navigation.reload()`
does the same. The browser's reload button, and any browser without client navigation, loads the
whole document.

## Running code after a navigation

Controllers connect and disconnect with their components, so most code needs nothing else. For
code that watches the whole page, such as analytics, listen to the browser's own event:

```js
navigation.addEventListener('navigatesuccess', () => {
  track(location.pathname);
});
```

`mk:ready` fires once, when the first page has loaded.

## Browser support

Client navigation needs the Navigation API with `NavigateEvent.sourceElement`: Chrome and Edge 135,
Firefox 147, and Safari 26.2.
Older browsers and readers without JavaScript load every page in full, with the same result.

In `markupkit dev`, styles from pages you've visited stay loaded until the next full reload. Built
sites remove a page's styles when you leave it.

Next: [Configuration and API](/configuration).

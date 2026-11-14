import type { Loader } from '@threadlabs/markupkit';

// The build runs this loader and writes the page as HTML.
export const load = (() => ({
  props: {
    parts: [
      { name: 'This page', file: 'app/pages/index.html' },
      { name: 'Its data', file: 'app/pages/index.server.ts' },
      { name: 'The header and footer', file: 'app/layouts/default.html' },
      { name: 'A form that saves messages', file: 'app/pages/guestbook.server.ts' },
      { name: 'A JSON endpoint', file: 'app/api/hello.server.ts' },
      { name: 'Styles for every page', file: 'app/styles/page.css' },
    ],
  },
})) satisfies Loader;

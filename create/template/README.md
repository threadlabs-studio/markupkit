# MarkupKit app

```sh
npm run dev       # develop at http://127.0.0.1:3000/
npm run build     # write the site and its server to dist/
npm start         # run the built server
```

- `app/pages/` holds one file per page. A `.server.ts` file beside a page loads its data and answers its forms.
- `app/layouts/default.html` wraps every page.
- `app/api/` holds endpoints, such as `hello.server.ts` at `/api/hello`.
- `app/styles/page.css` styles every page; each component's `<style>` styles only that component.
- `public/` holds files served as they are, such as `favicon.svg`.

Read the guide at https://threadlabs.studio/markupkit/.

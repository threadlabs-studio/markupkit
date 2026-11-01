# Repository guidance

- MarkupKit is a Threadlabs product, published as `@threadlabs/markupkit` under MIT. Preserve the inherited Next Web Working Group copyright notice.
- README.md defines the product. `threadlabs.config.json` defines ownership; preview Foundation plans before applying them and change managed files through Foundation.
- HTML Next remains a Next Web Working Group proposal and runtime dependency. Use its public package exports; never reach into its repository or maintain a second component parser or runtime.
- MarkupKit owns application routing, rendering, data delivery, and browser adoption. Markupress builds documentation on MarkupKit and owns Markdown, documentation versions, and its theme.
- The website has its own product styling and retains the original MarkupKit logo. Keep implementation claims accurate and link proposal semantics to https://nextwebwg.org/declarative-components/.
- Public product copy describes current capabilities. Keep internal work, package renaming history, and publication status out of it. Do not add migration guides for these alpha package changes.
- Use strict ESM TypeScript, Corepack pnpm, Oxlint, and project-owned CSS. Do not add Prettier or Tailwind.
- Preserve unrelated work and shared Git history. Use a single agent by default; cross-model review is off. Do not use `codex/` branch names.
- Audit native browser mechanisms before adding runtime behavior. Keep independent regression coverage for platform defects exposed by consumers.
- Run focused tests and `corepack pnpm verify:inner` during development; run `corepack pnpm verify:pr` before handoff. Exercise packed installed consumers.
- Run one foreground browser-test runner at a time with one worker. Keep CI jobs within 15 minutes and shard longer browser suites.
- Publish through the npm environment using trusted publishing. The first publication requires an authenticated npm owner; deprecate `@nextwebwg/htmlkit` and `@threadlabs/htmlkit` only after the replacement is published and its consumer migration is verified.

- Use minimum-version ranges for Threadlabs and Nextwebwg dependencies without a
  speculative 1.0 or later major-version ceiling. Lockfiles record exact tested
  resolutions. Restrict a range only for a demonstrated API requirement or verified
  incompatible release, and record the reason.

- The public documentation URL is `https://threadlabs.studio/markupkit/`. Keep the
  `/markupkit/` base and `https://threadlabs.studio` origin in the website config.
  GitHub Pages is the upstream host for the Threadlabs website proxy; use the
  Threadlabs URL in public links, package metadata, and generated site metadata.

# System UI

System UI is an HTML Next component library for MarkupKit websites and MarkupNative apps. Both use the same component imports and slots. The window surface follows the system font and color scheme by default. Controls use Looma and follow platform conventions for placement, keyboard input, and focus. An application can opt into a native presenter where it needs a platform view.

```html
<link rel="component" href="@threadlabs/system-ui/components/window.html">
<template component="my-app-layout">
  <system-window><slot name="page"></slot></system-window>
</template>
```

The portable root entry has no runtime dependencies or browser/native globals. Install its portable root on its own or select the web and native entries needed by the application. Web controls use HTML Next alpha.74 or later and Looma 0.49.0 or later; MarkupKit applications already supply HTML Next. The optional MarkupKit adapter uses MarkupKit 0.4.4 or later through its public navigation entry.

- @threadlabs/system-ui: portable models, view projections and theme resolution.
- @threadlabs/system-ui/web: scoped Looma themes and text-editor binding.
- @threadlabs/system-ui/markupkit: editing integration with MarkupKit page departure.
- @threadlabs/system-ui/components/* and /web.css: selected component resources and Looma styles.
- @threadlabs/system-ui/native: explicit checked component registrations and presenter source URLs for build tools.
- @threadlabs/system-ui/native/*: owning Apple and experimental Android presenter sources.

The web entry does not import the MarkupKit adapter. Generic experimental native inventory belongs to the separate `@threadlabs/markupnative` development package; general app generation remains incomplete.

Owning model, component, browser and native checks live here. Native source/protocol compilation: pnpm --filter @threadlabs/system-ui test:native. UI fixture generation: ruby packages/system-ui/tests/native-ui/project.rb /tmp/system-ui-input input. The MarkupKit integration test drives the owning page-departure transport; shipped code uses only the public navigation entry, and packed/browser consumers verify those public boundaries.

Source packaging does not establish physical-device, complete input/accessibility or latest-macOS parity.

The Android source setup is documented in [native/android/README.md](native/android/README.md). It supplies Material editor and collection widgets with presentation-only lifetimes; the application host still supplies the JS engine, model, persistence, navigation and Gradle project. Native SDKs are not installed by this package.

## Select native presentation

System UI follows the host platform's visual and interaction conventions. Each
presenter can use an OS widget or draw the control when the presentation needs
more flexibility. Drawn controls keep the platform's keyboard, focus,
accessibility and state behavior. Qualify those details on each target.

Applications can supply resolved Looma colors to macOS presenters through
`SystemLoomaPalette.swift`. Pass a JSON object with `light` and `dark` maps of
public Looma token names to opaque sRGB hex colors. The host supplies the
effective scheme and a platform fallback per role. The presenter chooses how
each role applies to its control. Use the same resolved values for corresponding
Looma and native control states when the application requests visual parity.

Native tooling can select package-owned registrations alongside application-owned bindings:

```js
import { systemUINativeBindings } from "@threadlabs/system-ui/native";

const bindings = [...customBindings, ...systemUINativeBindings()];
```

Each record contains a canonical component `definition` URL, a pinned `contractRevision`, target implementation identifiers and per-target `sources` URLs. The separate experimental MarkupNative inventory accepts these records structurally; System UI imports no native generator. The registration entry can be loaded without MarkupKit, HTML Next or Looma installed. Neither the portable nor web entry imports it. Select individual records when only some controls are needed.

A build that stages source resources can pass `systemUINativeBindings(resolveResource)`, where the resolver maps exported package resource specifiers to their canonical staged URLs. The resolver does not calculate or approve new interface revisions. Changed component interfaces must still pass the owning native qualification and update the package's pins; ordinary application builds never refresh them.

The sources list identifies the component's presenter files, not a complete application or dependency installation plan. Hosts still supply their JS engine, platform framework dependencies, model transport, services, scene/navigation lifetime and compilation setup. Apple navigation support remains a separate explicit source resource. Registration does not extend the documented platform verification scope.

# System UI

System UI adapts a selected Looma theme for the target operating system and OS version. Looma uses the resulting public token values to style its controls. System UI also supplies the HTML Next components needed for MarkupKit and MarkupNative application composition, such as a shared application window. MarkupKit websites and MarkupNative apps can use the same HTML Next declarations and slots.

Reusable controls and editor capabilities belong in Looma. When a Looma control cannot match macOS or Windows conventions through System UI token CSS, extend Looma with the missing token, styling hook, control, or behavior. System UI supplies the platform-specific values for Looma’s supported tokens. For the manuscript editor, that includes reusable typography and paragraph controls, caret and tracked-range geometry, selection and scroll behavior, and accessibility. The application composes the manuscript page and navigation, and owns source versions and draft persistence.

MarkupNative substitutes OS-level presenters for selected HTML Next components. A substitution implements the component's existing contract, including its interaction and accessibility semantics. The app host provides windows, WebView, persistence and other services. It owns the choice of which components to substitute on each platform.

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
- @threadlabs/system-ui/components/* and /web.css: framework component resources and shared Looma styles.
- @threadlabs/system-ui/native: explicit checked component registrations and presenter source URLs for build tools.
- @threadlabs/system-ui/native/*: owning Apple and experimental Android presenter sources.

The web and MarkupKit entries expose separate integrations.

## Adapt a Looma theme to a platform

Start with the selected Looma base theme. Inherit its colors, typography,
spacing, and other public tokens wherever they already suit the target. Apply
targeted adjustments only to the tokens that need to change for the operating
system or version. Where a role needs adaptation, derive its value from the
base token when that preserves the theme and the platform behavior. Compare
two distinct base themes under the same profile. Check light and dark modes
and respect forced colors and reduced motion. An OS version without its own
adjustment can use the generic OS adjustments. If the OS has no adjustments,
the base theme still applies.

Load base token CSS before the scoped platform overrides. CSS inheritance is
enough when the platform can set the public Looma token directly. If a platform
value needs to be mapped or a value needs to be derived from the base theme, an
optional translation layer can resolve those specific tokens before the same
theme is consumed by the controls. The platform layer keeps omitted values
inherited. Add a new token or styling hook in Looma when a control exposes no
way to make the adjustment.

The current `web.css` imports Looma's base token, light, and dark styles.
`resolveSystemTheme` merges an explicit parent preference set with a scoped
override. `createWebThemeScope` uses it to write accent, accent foreground,
and reduced-motion values while reacting to browser appearance preferences.
The CSS cascade provides inheritance for the remaining tokens.

Owning model, component, browser and native checks live here. Native source/protocol compilation: pnpm --filter @threadlabs/system-ui test:native. UI fixture generation: ruby packages/system-ui/tests/native-ui/project.rb /tmp/system-ui-input input. The MarkupKit integration test drives the owning page-departure transport; shipped code uses only the public navigation entry, and packed/browser consumers verify those public boundaries.

Source packaging does not establish physical-device, complete input/accessibility or latest-macOS parity.

The Android source setup is documented in [native/android/README.md](native/android/README.md). It supplies Material editor and collection widgets with presentation-only lifetimes; the application host still supplies the JS engine, model, persistence, navigation and Gradle project. Native SDKs are not installed by this package.

## Select native presentation

MarkupNative applies native registrations when the host selects an OS-level
presenter for an HTML Next component. A presenter may use an OS widget or draw
controls to match platform conventions. Both approaches preserve the component's
keyboard, focus, accessibility and state behavior. Qualify those details on each target.

Select substitutions by component and target. Moving a floating dialog beyond
the app frame can motivate choosing a native modal presenter for that component.
Each dialog instance on the target uses the same presenter and creation path.
The draggable setting controls movement for that instance.

Applications can supply the same resolved Looma colors, including selected
platform adjustments, to macOS presenters through `SystemLoomaPalette.swift`. Pass a JSON object with `light` and `dark` maps of
public Looma token names to opaque sRGB hex colors. The host supplies the
effective scheme and a platform fallback per role. The presenter chooses how
each role applies to its control. Use the same resolved values for corresponding
Looma and native control states when the application requests visual parity.

Native tooling can select package-owned registrations alongside application-owned bindings:

```js
import { systemUINativeBindings } from "@threadlabs/system-ui/native";

const bindings = [...customBindings, ...systemUINativeBindings()];
```

Each record contains a canonical component `definition` URL, a pinned `contractRevision`, target implementation identifiers and per-target `sources` URLs. MarkupNative uses those records to match a selected component with its presenter. The registration entry is separately importable from the portable and web entries.

A build that stages source resources can pass `systemUINativeBindings(resolveResource)`, where the resolver maps exported package resource specifiers to their canonical staged URLs. The resolver does not calculate or approve new interface revisions. Changed component interfaces must still pass the owning native qualification and update the package's pins; ordinary application builds never refresh them.

The sources list identifies the component's presenter files, not a complete application or dependency installation plan. Hosts still supply their JS engine, platform framework dependencies, model transport, services, scene/navigation lifetime and compilation setup. Apple navigation support remains a separate explicit source resource. Registration does not extend the documented platform verification scope.

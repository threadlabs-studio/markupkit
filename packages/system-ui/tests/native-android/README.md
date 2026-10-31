# Android collection checks

These checks run against native controls in a host application with the same explicit Android/Material inputs as the [presenter setup](../../native/android/README.md). They are not JavaScript mocks or an application generator.

From the tooling repository root, generate the fixture with the installed workspace runtime:

```sh
corepack pnpm exec tsx packages/system-ui/tests/native-android/collection-fixtures.ts > /path/to/app/src/main/assets/collection-fixtures.json
```

Add `native/android/studio/threadlabs/systemui/SystemCollection.java` to the host's main sources and this directory's `SystemCollectionChecks.java` to its instrumentation sources. On the instrumentation UI thread, call:

```java
int passed = SystemCollectionChecks.run(activity, fixtures);
```

`fixtures` is the asset parsed as `JSONObject`, and `activity` supplies a Material3-themed context. To detect loss of host typography, use a theme overlay whose `borderlessButtonStyle` extends `Widget.Material3.Button.TextButton` with a distinct `android:fontFamily` such as `monospace`. The checks compare initial system typography and its restoration after serif with a fresh native button under that context. A failed check throws. The returned eight scenario groups cover rows/activation without optimistic selection, projected reordering/selection, pending, error, empty/removal, terminal close and unsupported schema. These isolated controls do not qualify attached-window keyboard continuity, TalkBack, virtualized lists or adaptive collection/detail navigation. The application integration should separately tap a collection destination, edit, resolve a dirty leave request and reopen the saved resource through its shared behavior module.

## Adaptive composition

Add `SystemCollectionDetail.java` and the host's explicit `androidx.slidingpanelayout:slidingpanelayout:1.2.0` dependency. Add `SystemCollectionDetailChecks.java` to instrumentation and run `SystemCollectionDetailChecks.run(materialContext)` on the UI thread. Four groups exercise compact/wide/back/closed composition over actual native child views, including retained input and selected range. The attached-window `runWindow(instrumentation, activity)` check runs from the instrumentation thread and verifies that an animated detail opening hides obscured collection controls. These checks do not qualify an Activity's configuration or process lifetime. The host should also rotate its running collection/editor app, check control/session/history retention, activate a different wide-pane destination while dirty, cancel leaving, and use native Back for Stay and Save-and-leave.

## Collection accent

Add `SystemCollectionThemeChecks.java` to instrumentation and call its `run(activity, fixtures)` on the UI thread. Two scenario groups create actual light/dark Material contexts and check Forest, Ember, white and black seeds against native roles and surface contrast. Theme changes preserve keyed controls and native disabled text; clearing the theme restores the exact original `ColorStateList`. Newly created rows inherit the active accent, and a closed presenter rejects mutation. These checks do not establish arbitrary host-surface contrast or theme propagation through an application host; exercise that integration separately with a dirty editor.

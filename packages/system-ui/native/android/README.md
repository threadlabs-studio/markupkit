# Experimental Android presenter source

These resources supply the System UI text editor and collection as native Material controls. Add these presenter sources to the application host, together with its platform dependencies. The owning class is `studio.threadlabs.systemui.SystemTextEditor`; its source path is available through `@threadlabs/system-ui/native/android/studio/threadlabs/systemui/SystemTextEditor.java`.

Copy the source into the application's Java source tree, or add this directory to the application's Gradle Java source directories. Use a Material3-themed activity/context and the application's explicit Material dependency. The current proof uses Material1.14.0, Android API36, Java17 source syntax and a `Theme.Material3.DayNight.NoActionBar` activity. Those are the qualified example's build inputs, not a claim of runtime coverage on every supported SDK. The npm build does not download an Android SDK or accept licenses.

```java
import studio.threadlabs.systemui.SystemTextEditor;

SystemTextEditor editor = new SystemTextEditor(activity, (intent, sequence) -> {
    // Send the intent to the application-owned shared behavior model.
    // Echo this presentation's sequence with its resulting projection.
});
container.addView(editor);
editor.render(view, acknowledgedInputSequence);
editor.accent(resolvedFill, resolvedForeground); // null restores the native defaults
// When removing this presentation:
editor.close();
```

Call the View methods on Android's UI thread. `render` consumes the existing `markupkit.text-editor.v1` projection and rejects an unknown schema or unsupported appearance group. The host echoes the input sequence on resulting projections so an older asynchronous response cannot replace newer native input. Keep sequences scoped to the presentation/session; they are transport acknowledgements, not provider versions. The shared behavior model still decides save availability, dirty-leave policy, stale results and commit reconciliation.

`close()` is terminal and idempotent. It stops intent delivery, releases the sink, disables the controls and dismisses confirmation presentation. Subsequent `render`/`accent` calls fail. It does not close the model, stop a provider write or decide navigation. Construct a new presentation when the host reconnects to a retained model. Widget fields and dialog objects are implementation details.

Accent mapping stays bounded: enabled Save fill/foreground and the [focused field outline](https://developer.android.com/reference/com/google/android/material/textfield/TextInputLayout#setBoxStrokeColor(int)) use the resolved accent, while disabled colors and other Material surfaces retain native defaults. Appearance preferences map the existing action/spacing/typography groups; no arbitrary CSS or native geometry is accepted. The app host owns the surrounding toolbar, navigation, theme chooser and window lifecycle.

## Collection presentation

`studio.threadlabs.systemui.SystemCollection` consumes the portable `markupkit.collection.v1` projection:

```java
SystemCollection collection = new SystemCollection(activity, intent -> {
    // Validate the collection/resource/destination, then dispatch to the shared model.
});
scrollContent.addView(collection);
collection.accent(resolvedSeed); // Integer sRGB seed; null restores native row colors
collection.render(collectionProjection);
// On removal:
collection.close();
```

The host owns scrolling, outer insets and any recovery action. This presenter lays out native Material text buttons for a bounded collection; it does not virtualize large data sets. Rows retain their native control identity by resource key through projection updates and reordering. Each activation carries `type: "activate-collection"`, `collectionId`, `key` and `href`. Clicking does not change the current item: selected state and its checkmark follow the next projection. Focus is independent of selection. Pending and failed refreshes can retain supplied rows; empty state removes them. Removed controls stop emitting intents. `close()` is terminal and idempotent, disables rows and releases the sink.

Spacing and serif typography use the existing bounded appearance groups. `accent(Integer seed)` maps the portable accent seed through [MaterialColors.getColorRoles](https://developer.android.com/reference/com/google/android/material/color/MaterialColors#getColorRoles(android.content.Context,int)) to Material’s scheme-appropriate accent text role. It updates retained and subsequently created rows, preserves native disabled text and restores each row’s original color list for `null`. Use the resolved accent’s `fill` as the seed, rather than its on-fill `foreground`. Native geometry, surfaces, ripple and status colors come from the supplied Material theme; no arbitrary style object is accepted. Reapply the seed when the host changes its color-scheme context. The application still owns navigation policy and the model/provider lifetime.

## Adaptive collection/detail

`studio.threadlabs.systemui.SystemCollectionDetail` composes two retained child views over AndroidX `SlidingPaneLayout`. Supply `androidx.slidingpanelayout:slidingpanelayout:1.2.0` alongside Material in the host Gradle project. Android's [two-pane guide](https://developer.android.com/develop/ui/views/layout/twopane) explains its available-width policy. This source targets the existing View-based host. Google places SlidingPaneLayout in [maintenance mode](https://developer.android.com/jetpack/androidx/releases/slidingpanelayout) and recommends Compose for new Android UI development; this adapter does not establish a Compose presenter.

```java
SystemCollectionDetail panes = new SystemCollectionDetail(activity,
    collectionScrollView, detailScrollView,
    requestedRegion -> application.requestCollection());
container.addView(panes);
panes.render(hasCommittedDetail
    ? SystemCollectionDetail.Region.DETAIL
    : SystemCollectionDetail.Region.COLLECTION);
// In the host's native Back callback:
boolean handled = panes.requestBack();
// On removal, separately dispose the child presenters when their lifetimes end:
panes.close();
```

The implementation gives the native container 280dp collection and 360dp detail widths, with remaining space allocated to detail. These presenter defaults are separate from application theme preferences; pane geometry is not a theme setting. Android decides whether those panes fit; there is no device-name or orientation switch. A Material surface behind detail prevents overlapping collection content from showing through. Neither child is replaced during allocation changes.

`render` supplies the committed region. Back requests collection while leaving detail in place until a later projection commits a different region. Internal pane-drag gestures are locked so they cannot bypass an application's dirty-leave decision. Width changes request no navigation. The host connects native Back and toolbar controls, owns history/provider decisions, and supplies independently scrolling child views and their outer insets. For API34+ compact presentation, connect the host's AndroidX Back progress callbacks to `startBackProgress(event)`, `updateBackProgress(event)` and `cancelBackProgress()`. Call `requestBack()` only from the completed Back callback (or an explicit toolbar/button action). Progress is a native visual preview, not a navigation request. Cancel restores the retained detail without changing application history. A completed gesture asks the application for its normal shared leave decision; `render(DETAIL)` restores preview for a refused/pending leave, while `render(COLLECTION)` finishes the accepted visual transition.

The source uses the public AndroidX Transition seeking APIs and a translation-only property transition. It leaves text controls mounted and visible rather than using a visibility transition that can clear native focus. Supply AndroidX Activity1.8.0 and Transition1.5.0 (the qualified proof versions), alongside the other presenter dependencies. Android's [progress callback guidance](https://developer.android.com/guide/navigation/custom-back/support-animations-views) defines started/progressed/cancelled/completed delivery. The host connects those callbacks, enables its callback only while it can handle Back, and leaves root/system Back to Android. Wide layout, older SDKs and disabled system animators use the same completion request without an animated compact preview.

During preview, the retained collection is drawn beneath the translated detail. SlidingPaneLayout1.2.0 otherwise clips it against the untransformed detail bounds; the adapter compensates only while seeking. Native controls stay in the same hierarchy. The attached-window screenshot check asserts the revealed collection pixels after drawing settles.

Map the resolved theme's motion value on each projection with `panes.reducedMotion("reduced".equals(theme.optString("motion")))`. This is presentation data, not a navigation policy. True clears an in-flight preview without requesting navigation and suppresses subsequent previews. False permits a future preview only when the native animator setting also allows it; it never overrides an OS motion restriction. Gesture completion continues to use `requestBack()` and the shared leave decision. This method is terminal after `close()`, like `render`. Other native/control transitions and the system gesture affordance retain their host mapping.

Preview motion has no theme geometry setting. AndroidX owns seeking and completion/cancellation animation. A size change or teardown clears the preview; callbacks from an earlier transition cannot alter a newer one. Application scene/provider ownership and cancellation of durable writes remain separate.

`close()` disconnects the region callback and rejects subsequent renders. It does not close child editors/collections or dispose the application model. This wrapper keeps its lifetime method separate from SlidingPaneLayout's `close()` pane action. Call methods on the UI thread.

Whole-app view retention also depends on Activity configuration handling. The qualified example handles orientation/size changes without recreating its Activity. This is an explicit host setting, not a framework promise of control identity across Activity recreation or process death.

## Native checks

The proof's dialog interactions use Android's [UiAutomation](https://developer.android.com/reference/android/app/UiAutomation) and accessible [click actions](https://developer.android.com/reference/android/view/accessibility/AccessibilityNodeInfo#performAction(int)); that is not a full TalkBack or accessibility audit. Actual device/SDK/provider coverage and remaining input/lifecycle limits belong in the qualification receipt. Apple presenter sources and their host checks remain separate.

`tests/native-android/collection-fixtures.ts` generates real portable projections. Add `SystemCollectionChecks.java` from the same directory to an Android instrumentation target and call `SystemCollectionChecks.run(materialContext, fixtures)` on its UI thread. The checks exercise native rows, activation, projected selection, keyed reuse, status states, removal, close and unknown-schema rejection. See that directory's README for the fixture procedure. `SystemCollectionThemeChecks.run(materialContext, fixtures)` adds light/dark native role, text-contrast, disabled-state, keyed-identity, new-row and default-restoration checks. The npm test gate does not launch an emulator.

`SystemCollectionDetailChecks.run(materialContext)` checks actual compact/wide native measurement, committed region across resize, unchanged text/selection, noncommitting Back and terminal teardown. Attached-window rotation, keyboard behavior and application navigation still require separate host checks. `SystemCollectionBackChecks.runWindow(instrumentation, activity)` exercises real attached compact preview progress on both edges, cancellation, retained text/caret, deferred leave and teardown. System edge-gesture delivery requires separate application instrumentation; the fixture alone does not establish OS callback wiring.

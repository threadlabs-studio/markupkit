import SwiftUI
import UIKit

@MainActor final class InputFixture: ObservableObject {
    @Published var value = ""
    @Published var session = "first"
    @Published var revision = 0
    @Published var inputRevision = 0
    private var nextInput = 0
    @Published var delayed = false
    @Published var inputId: String?
    @Published var coalesced = false
    @Published var serif = false
    @Published var composition = ""
    @Published var adaptation = ""
    @Published var navigationRequests = 0
    private weak var originalInput: UITextView?
    private var queued: (String, String?, Int)?
    var view: SystemTextEditorView {
        let object: [String: Any] = [
            "inputId": inputId as Any? ?? NSNull(), "inputRevision": inputRevision,
            "schema": "markupkit.text-editor.v1", "id": "input", "revision": revision,
            "sessionId": session, "active": true, "value": value,
            "appearance": ["action": "system", "spacing": "system", "typography": serif ? "serif" : "system"],
            "field": ["id": "native-input", "label": "Draft", "placeholder": ""],
            "status": ["kind": "dirty", "text": "Input fixture"],
            "save": ["id": "save", "label": "Save", "enabled": false, "pending": false]
        ]
        return try! JSONDecoder().decode(SystemTextEditorView.self, from: JSONSerialization.data(withJSONObject: object))
    }
    private func nativeInput() -> UITextView? {
        func inputs(_ view: UIView) -> [UITextView] {
            (view as? UITextView).map { [$0] } ?? view.subviews.flatMap(inputs)
        }
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
        let views = windows.filter { $0.isKeyWindow }.flatMap(inputs)
        return views.first(where: { $0.isFirstResponder }) ?? views.first
    }
    func startComposition() {
        guard let input = nativeInput() else { return }
        originalInput = input
        input.setMarkedText("に", selectedRange: NSRange(location: 1, length: 0))
    }
    func finishComposition() { nativeInput()?.unmarkText() }
    func rememberAdaptationInput() {
        guard let input = nativeInput() else { return }
        originalInput = input
        input.selectedRange = NSRange(location: 2, length: 4)
    }
    func inspectAdaptation() {
        guard let input = nativeInput() else { adaptation = "Missing native input"; return }
        let result: [String: Any] = ["sameControl": input === originalInput,
            "focused": input.isFirstResponder, "native": input.text ?? "", "draft": value,
            "session": session, "requests": navigationRequests,
            "selectionStart": input.selectedRange.location, "selectionLength": input.selectedRange.length,
            "width": input.bounds.width, "sizeClass": input.traitCollection.horizontalSizeClass.rawValue]
        adaptation = String(data: try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), encoding: .utf8)!
    }
    func inspectComposition() {
        guard let input = nativeInput() else { composition = "Missing native input"; return }
        let marked = input.markedTextRange.flatMap { input.text(in: $0) }
        let result: [String: Any] = ["marked": marked as Any? ?? NSNull(), "native": input.text ?? "",
                                   "draft": value, "focused": input.isFirstResponder, "sameControl": input === originalInput]
        composition = String(data: try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), encoding: .utf8)!
    }
    func replace(_ value: String) {
        nextInput += 1
        self.value = value; inputId = nil; inputRevision = nextInput; revision += 1
    }
    func send(_ intent: SystemTextEditorIntent) {
        guard intent.sessionId == session, let value = intent.value else { return }
        let session = session
        nextInput += 1
        let acceptedInput = nextInput
        let publish = { [self] in
            guard self.session == session else { return }
            self.value = value; self.inputId = intent.inputId; self.inputRevision = acceptedInput; revision += 1
        }
        if coalesced {
            queued = (value, intent.inputId, acceptedInput)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.04) { [self] in
                guard self.session == session, let queued else { return }
                self.queued = nil
                self.value = queued.0; self.inputId = queued.1; self.inputRevision = queued.2; revision += 1
            }
        } else if delayed { revision += 1; DispatchQueue.main.asyncAfter(deadline: .now() + 0.04, execute: publish) }
        else { publish() }
    }
}

#if !ADAPTATION_FIXTURE
@main struct NativeInputApp: App {
    @StateObject private var model = InputFixture()
    var body: some Scene {
        WindowGroup {
            VStack {
                HStack {
                    Button("Coalesce projections") { model.coalesced = true }
                    Button("Restore a") { model.replace("a") }
                    Button("Delay projections") { model.delayed = true }
                    Button("External value") { model.replace("Provider replacement") }
                    Button("Next session") { model.session = "next"; model.inputId = nil; model.value = ""; model.revision += 1 }
                }
                if ProcessInfo.processInfo.arguments.contains("--composition") {
                    HStack {
                        Button("Start marked text") { model.startComposition() }
                        Button("Status update") { model.revision += 1 }
                        Button("Serif appearance") { model.serif.toggle(); model.revision += 1 }
                    }
                    HStack {
                        Button("Finish marked text") { model.finishComposition() }
                        Button("Inspect composition") { model.inspectComposition() }
                    }
                    Text(model.composition).font(.caption).accessibilityIdentifier("composition-state")
                }
                Text("Projection \(model.revision)").accessibilityIdentifier("projection")
                SystemTextEditor(view: model.view, send: model.send)
            }.padding()
        }
    }
}
#else
@main struct NativeAdaptationApp: App {
    @StateObject private var model = InputFixture()
    var body: some Scene {
        WindowGroup {
            if ProcessInfo.processInfo.arguments.contains("--platform-split") {
                NavigationSplitView(preferredCompactColumn: .constant(.detail)) {
                    collection
                } detail: {
                    editor
                }
            } else {
                SystemCollectionDetail(active: .detail, request: { _ in model.navigationRequests += 1 }) {
                    collection
                } detail: {
                    editor
                }
            }
        }
    }
    private var collection: some View {
        Text("Your notes").accessibilityIdentifier("adaptation-collection")
    }
    private var editor: some View {
        VStack {
            Text(model.adaptation).font(.caption).lineLimit(1).accessibilityIdentifier("adaptation-state")
            SystemTextEditor(view: model.view, send: model.send)
        }
        .padding()
        .navigationTitle("Adaptation")
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button("Remember input") { model.rememberAdaptationInput() }
                Button("Inspect input") { model.inspectAdaptation() }
            }
        }
    }
}
#endif

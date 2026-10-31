import SwiftUI

@MainActor final class AccessibilityFixture: ObservableObject {
    @Published var value = "An editable note"
    @Published var revision = 0
    @Published var inputId: String?
    @Published var inputRevision = 0
    @Published var saved = false
    @Published var selected = "first"
    init() { if ProcessInfo.processInfo.arguments.contains("--resize") { value = "" } }
    var editor: SystemTextEditorView {
        let object: [String: Any] = [
            "schema": "markupkit.text-editor.v1", "id": "accessible-note", "revision": revision,
            "inputRevision": inputRevision, "inputId": inputId as Any? ?? NSNull(),
            "sessionId": "accessible-visit", "active": true, "value": value,
            "appearance": ["action": "round", "spacing": "compact", "typography": "serif"],
            "field": ["id": "accessible-input", "label": "Your note", "placeholder": "Write your thoughts"],
            "status": ["kind": saved ? "clean" : "dirty", "text": saved ? "All your changes have been saved on this device" : "Your changes are ready to be saved on this device"],
            "save": ["id": "accessible-save", "label": "Save these changes to your notes", "enabled": true, "pending": false]
        ]
        return try! JSONDecoder().decode(SystemTextEditorView.self, from: JSONSerialization.data(withJSONObject: object))
    }
    var collection: SystemCollectionView {
        let items: [[String: Any]] = [
            ["key": "first", "href": "/first/", "label": "A quiet place to collect your thoughts", "summary": "Notes and observations from a longer journey", "current": selected == "first"],
            ["key": "second", "href": "/second/", "label": "Plans for the next thing you want to make", "summary": "Ideas that deserve a little more room", "current": selected == "second"]
        ]
        let object: [String: Any] = ["schema": "markupkit.collection.v1", "id": "accessible-notes", "label": "Your notes", "status": "ready", "message": "", "appearance": ["spacing": "compact", "typography": "serif"], "items": items]
        return try! JSONDecoder().decode(SystemCollectionView.self, from: JSONSerialization.data(withJSONObject: object))
    }
    func send(_ intent: SystemTextEditorIntent) {
        if intent.type == .edit, let text = intent.value {
            value = text; inputId = intent.inputId; inputRevision += 1; saved = false
        } else if intent.type == .save { saved = true }
        revision += 1
    }
}

struct ResizingEditorFixture: View {
    @ObservedObject var fixture: AccessibilityFixture
    @State private var size: DynamicTypeSize = .large
    var body: some View {
        VStack {
            HStack {
                Button("Largest text") { size = .accessibility5 }
                Button("Standard text") { size = .large }
            }.buttonStyle(.bordered).dynamicTypeSize(.large)
            Form { Section { SystemTextEditor(view: fixture.editor, send: fixture.send) } }
                .dynamicTypeSize(size)
        }
    }
}

@main struct NativeAccessibilityApp: App {
    @StateObject private var fixture = AccessibilityFixture()
    var body: some Scene {
        WindowGroup {
            if ProcessInfo.processInfo.arguments.contains("--collection") {
                SystemCollection(view: fixture.collection, activate: { fixture.selected = $0.key })
            } else if ProcessInfo.processInfo.arguments.contains("--resize") {
                ResizingEditorFixture(fixture: fixture)
            } else {
                Form { Section { SystemTextEditor(view: fixture.editor, send: fixture.send) } }
            }
        }
    }
}

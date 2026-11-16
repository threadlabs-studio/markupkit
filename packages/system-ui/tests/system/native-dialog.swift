import Foundation

@MainActor final class ConfirmationSurface: EditorConfirmationSurface {
    var attached = true
    var presentations: [EditorConfirmation] = []
    var updates: [EditorConfirmation] = []
    var dismissals = 0
    var choose: ((SystemTextEditorIntent.Choice) -> Void)?
    var dismissed: (() -> Void)?
    func present(_ request: EditorConfirmation, choose: @escaping (SystemTextEditorIntent.Choice) -> Void,
                 dismissed: @escaping () -> Void) -> Bool {
        guard attached else { return false }
        presentations.append(request); self.choose = choose; self.dismissed = dismissed
        return true
    }
    func update(_ request: EditorConfirmation) { updates.append(request) }
    func dismiss() { dismissals += 1 }
    func completeDismissal() { let done = dismissed; dismissed = nil; done?() }
}

@main struct NativeDialogTests {
    static func view(request: String = "leave-1", pending: Bool = false,
                     phase: String = "confirming") throws -> SystemTextEditorView {
        func action(_ name: String, enabled: Bool) -> [String: Any] {
            ["id": name, "label": name, "enabled": enabled, "pending": pending]
        }
        let object: [String: Any] = [
            "inputRevision": 0, "schema": "markupkit.text-editor.v1", "id": "note", "revision": 1,
            "sessionId": "editing-1", "active": true, "value": "Draft",
            "appearance": ["action": "system", "spacing": "system", "typography": "system"],
            "field": ["id": "note-value", "label": "Note", "placeholder": ""],
            "status": ["kind": pending ? "saving" : "dirty", "text": "Status"],
            "save": action("Save", enabled: !pending),
            "leave": ["id": request, "phase": phase, "title": "Save changes?", "message": "Unsaved draft",
                "save": action("Save and leave", enabled: !pending),
                "discard": action("Discard", enabled: !pending), "stay": action("Keep editing", enabled: true)]
        ]
        return try JSONDecoder().decode(SystemTextEditorView.self, from: JSONSerialization.data(withJSONObject: object))
    }
    @MainActor static func main() throws {
        let surface = ConfirmationSurface()
        let presentation = EditorConfirmationPresentation(surface: surface)
        var intents: [SystemTextEditorIntent] = []
        let send: (SystemTextEditorIntent) -> Void = { intents.append($0) }
        presentation.update(view: try view(pending: true), send: send)
        precondition(surface.presentations.count == 1 && !surface.presentations[0].leave.discard.enabled)
        presentation.update(view: try view(), send: send)
        precondition(surface.presentations.count == 1 && surface.updates.last!.leave.discard.enabled)
        let oldChoice = surface.choose!
        presentation.update(view: try view(request: "leave-2"), send: send)
        precondition(surface.dismissals == 1 && surface.presentations.count == 1 && intents.isEmpty)
        oldChoice(.discard)
        precondition(intents.isEmpty)
        surface.completeDismissal()
        precondition(surface.presentations.count == 2 && surface.presentations.last!.leave.id == "leave-2")
        oldChoice(.save)
        precondition(intents.isEmpty)
        surface.choose!(.save)
        precondition(intents.count == 1 && intents[0].leaveId == "leave-2" && intents[0].sessionId == "editing-1")
        presentation.update(view: try view(request: "leave-2", pending: true, phase: "saving"), send: send)
        presentation.update(view: try view(request: "leave-2"), send: send)
        precondition(surface.presentations.count == 2 && intents.count == 1)
        surface.completeDismissal()
        precondition(surface.presentations.count == 3)
        presentation.stop()
        surface.completeDismissal()
        precondition(surface.presentations.count == 3 && intents.count == 1)

        let detached = ConfirmationSurface(); detached.attached = false
        let retained = EditorConfirmationPresentation(surface: detached)
        retained.update(view: try view(), send: send)
        precondition(detached.presentations.isEmpty)
        detached.attached = true; retained.reconcile()
        precondition(detached.presentations.count == 1)
        var jobs: [@MainActor @Sendable () -> Void] = []
        let flush: @MainActor () -> Void = {
            let batch = jobs; jobs.removeAll()
            batch.forEach { $0() }
        }
        let deferredSurface = ConfirmationSurface()
        let deferred = EditorConfirmationPresentation(surface: deferredSurface, schedule: { jobs.append($0) })
        deferred.update(view: try view(), send: send)
        deferred.update(view: try view(request: "latest"), send: send)
        precondition(deferredSurface.presentations.isEmpty && jobs.count == 1)
        flush()
        precondition(deferredSurface.presentations.count == 1 && deferredSurface.presentations[0].leave.id == "latest")
        deferred.update(view: try view(request: "latest", pending: true), send: send)
        precondition(deferredSurface.updates.isEmpty)
        let beforeDisabledChoice = intents.count
        deferredSurface.choose!(.discard)
        precondition(intents.count == beforeDisabledChoice)
        flush()
        precondition(deferredSurface.updates.last?.leave.discard.enabled == false)
        deferred.update(view: try view(request: "latest"), send: send); flush()
        deferredSurface.choose!(.save)
        deferred.update(view: try view(request: "latest", pending: true, phase: "saving"), send: send)
        deferred.update(view: try view(request: "latest"), send: send)
        flush()
        precondition(deferredSurface.presentations.count == 1)
        deferredSurface.completeDismissal()
        precondition(deferredSurface.presentations.count == 1 && jobs.count == 1)
        flush()
        precondition(deferredSurface.presentations.count == 2)
        deferred.stop()
        precondition(deferredSurface.dismissals == 0)
        flush()
        precondition(deferredSurface.dismissals == 1)
        deferredSurface.completeDismissal(); flush()
        precondition(deferredSurface.presentations.count == 2)
        let replacedSurface = ConfirmationSurface()
        let replaced = EditorConfirmationPresentation(surface: replacedSurface, schedule: { jobs.append($0) })
        replaced.update(view: try view(), send: send); flush()
        let staleChoice = replacedSurface.choose!
        replaced.update(view: try view(request: "replacement"), send: send)
        let beforeStaleChoice = intents.count
        staleChoice(.discard)
        precondition(intents.count == beforeStaleChoice)
        flush(); replacedSurface.completeDismissal(); flush()
        precondition(replacedSurface.presentations.last?.leave.id == "replacement")
        replaced.stop(); flush(); replacedSurface.completeDismissal(); flush()
        let removedSurface = ConfirmationSurface()
        weak var removed: EditorConfirmationPresentation?
        do {
            let owner = EditorConfirmationPresentation(surface: removedSurface, schedule: { jobs.append($0) })
            removed = owner
            owner.update(view: try view(), send: send); owner.stop()
        }
        precondition(removed != nil && removedSurface.presentations.isEmpty)
        flush()
        precondition(removed == nil && removedSurface.presentations.isEmpty)
        print("Native dialog lifecycle passed: action availability, replacement after dismissal, stale callbacks, Save without synthetic Stay, retry, teardown and late attachment")
        print("Deferred dialog lifecycle passed: latest request, action updates, retry after dismissal, teardown and removal before presentation")
    }
}

import SwiftUI

/// The serializable view produced by MarkupKit textEditorView. The application owns its model.
public struct SystemTextEditorView: Decodable {
    public enum Schema: String, Decodable { case v1 = "markupkit.text-editor.v1" }
    public struct Action: Decodable {
        public let id: String
        public let label: String
        public let enabled: Bool
        public let pending: Bool
    }
    public struct Appearance: Decodable {
        public enum Shape: String, Decodable { case system, round }
        public enum Spacing: String, Decodable { case system, compact, comfortable }
        public enum Typography: String, Decodable { case system, serif }
        public let action: Shape
        public let spacing: Spacing
        public let typography: Typography
    }
    public struct Field: Decodable {
        public let id: String
        public let label: String
        public let placeholder: String
    }
    public struct Status: Decodable {
        public enum Kind: String, Decodable {
            case clean, dirty, saving, error, conflict
            case newerEdits = "newer-edits"
        }
        public let kind: Kind
        public let text: String
    }
    public struct Leave: Decodable {
        public enum Phase: String, Decodable { case confirming, saving }
        public let id: String
        public let phase: Phase
        public let title: String
        public let message: String
        public let save: Action
        public let discard: Action
        public let stay: Action
    }
    public let schema: Schema
    public let id: String
    public let inputId: String?
    public let inputRevision: Int
    public let revision: Int
    public let sessionId: String
    public let active: Bool
    public let appearance: Appearance
    public let value: String
    public let field: Field
    public let status: Status
    public let save: Action
    public let leave: Leave?
}

/// Serializable user input only. Provider and navigation outcomes belong to the application.
public struct SystemTextEditorIntent: Encodable {
    public enum Kind: String, Encodable { case edit, save; case chooseLeave = "choose-leave" }
    public enum Choice: String, Encodable { case save, discard, stay }
    public let type: Kind
    public let sessionId: String
    public let value: String?
    public let inputId: String?
    public let leaveId: String?
    public let choice: Choice?

    fileprivate init(_ type: Kind, session: String, value: String? = nil, inputId: String? = nil,
                     leave: String? = nil, choice: Choice? = nil) {
        self.type = type; self.sessionId = session; self.value = value; self.inputId = inputId
        self.leaveId = leave; self.choice = choice
    }
}

/// Native controls over the shared MarkupKit view/intent protocol; contains no editing policy.
/// Supply platform tint and accessibility preferences through the surrounding SwiftUI environment.
@available(macOS 14, iOS 17, *)
@MainActor public struct SystemTextEditor: View {
    public let view: SystemTextEditorView
    private let send: (SystemTextEditorIntent) -> Void
    private let actionForeground: Color?

    public init(view: SystemTextEditorView, actionForeground: Color? = nil, send: @escaping (SystemTextEditorIntent) -> Void) {
        self.view = view; self.send = send; self.actionForeground = actionForeground
    }
    private var gap: CGFloat {
        switch view.appearance.spacing {
        case .system: return 12
        case .compact: return 8
        case .comfortable: return 16
        }
    }
    private func choose(_ choice: SystemTextEditorIntent.Choice, _ leave: SystemTextEditorView.Leave) {
        send(.init(.chooseLeave, session: view.sessionId, leave: leave.id, choice: choice))
    }
    private var status: some View {
        Text(view.status.text).font(.callout).foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier(view.id + "-status")
    }
    private func saveAction(stacked: Bool) -> some View {
        HStack {
            if view.save.pending { ProgressView().controlSize(.small) }
            Button { send(.init(.save, session: view.sessionId)) } label: {
                if let actionForeground { Text(view.save.label).foregroundStyle(actionForeground).fixedSize(horizontal: false, vertical: true) }
                else { Text(view.save.label).fixedSize(horizontal: false, vertical: true) }
            }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(stacked ? .roundedRectangle : view.appearance.action == .round ? .capsule : .automatic)
                .disabled(!view.save.enabled)
                .accessibilityIdentifier(view.save.id)
        }
    }
    public var body: some View {
        VStack(alignment: .leading, spacing: gap) {
            Text(view.field.label).font(.headline)
            EditorTextInput(value: view.value, revision: view.revision, inputRevision: view.inputRevision, inputId: view.inputId, edit: {
                send(.init(.edit, session: view.sessionId, value: $0, inputId: $1))
            })
            .id(view.sessionId)
            .font(view.appearance.typography == .serif ? .system(.body, design: .serif) : .body)
            .accessibilityLabel(view.field.label)
            .accessibilityHint(view.field.placeholder)
            .accessibilityIdentifier(view.field.id)
            .disabled(!view.active)
            .frame(minHeight: 140)
            ViewThatFits(in: .horizontal) {
                HStack { status; Spacer(); saveAction(stacked: false) }
                VStack(alignment: .leading, spacing: gap) { status; saveAction(stacked: true) }
            }
            if let leave = view.leave, leave.phase == .saving {
                Button(leave.stay.label) { choose(.stay, leave) }
                    .disabled(!leave.stay.enabled)
                    .accessibilityIdentifier(leave.stay.id)
            }
        }
        .background(EditorConfirmationHost(view: view, send: send).frame(width: 0, height: 0))
    }
}

/// Native input needs an immediate binding value while the application publishes its next view.
/// Session identity resets this platform buffer; shared behavior still owns the accepted draft.
@available(macOS 14, iOS 17, *)
private struct EditorTextInput: View {
    private struct Projection: Equatable {
        let value: String
        let revision: Int
        let inputId: String?
        let inputRevision: Int
    }
    let value: String
    let revision: Int
    let inputRevision: Int
    let inputId: String?
    let edit: (String, String) -> Void
    @StateObject private var buffer: EditorInputBuffer
    init(value: String, revision: Int, inputRevision: Int, inputId: String?, edit: @escaping (String, String) -> Void) {
        self.value = value; self.revision = revision; self.inputRevision = inputRevision; self.inputId = inputId; self.edit = edit
        _buffer = StateObject(wrappedValue: EditorInputBuffer(value: value, inputRevision: inputRevision))
    }
    var body: some View {
        TextEditor(text: Binding(get: { buffer.text }, set: {
            let id = buffer.submit($0)
            edit($0, id)
        }))
            .onChange(of: Projection(value: value, revision: revision, inputId: inputId, inputRevision: inputRevision)) { _, projection in
                buffer.accept(value: projection.value, inputId: projection.inputId, inputRevision: projection.inputRevision)
            }
    }
}

@MainActor private final class EditorInputBuffer: ObservableObject {
    @Published private(set) var text: String
    private var pending: [String] = []
    private var acknowledgedRevision: Int
    init(value: String, inputRevision: Int) {
        text = value; acknowledgedRevision = inputRevision
    }
    func submit(_ value: String) -> String {
        let id = UUID().uuidString
        pending.append(id); text = value
        return id
    }
    func accept(value: String, inputId: String?, inputRevision: Int) {
        if inputRevision < acknowledgedRevision { return }
        // Status-only updates do not acknowledge or replace pending native input.
        if inputRevision == acknowledgedRevision && !pending.isEmpty { return }
        acknowledgedRevision = inputRevision
        if let id = inputId, let acknowledged = pending.firstIndex(of: id) {
            pending.removeFirst(acknowledged + 1)
            if !pending.isEmpty { return }
        } else {
            pending.removeAll()
        }
        if text != value { text = value }
    }
}

struct EditorConfirmation {
    let sessionId: String
    let leave: SystemTextEditorView.Leave
    var identity: [String] { [sessionId, leave.id] }
    var content: [String] { [leave.title, leave.message, leave.save.label, leave.discard.label, leave.stay.label] }
}

@MainActor protocol EditorConfirmationSurface: AnyObject {
    func present(_ request: EditorConfirmation, choose: @escaping (SystemTextEditorIntent.Choice) -> Void,
                 dismissed: @escaping () -> Void) -> Bool
    func update(_ request: EditorConfirmation)
    func dismiss()
}

@MainActor final class EditorConfirmationPresentation {
    typealias Schedule = @MainActor (@escaping @MainActor @Sendable () -> Void) -> Void
    private let surface: EditorConfirmationSurface
    private let schedule: Schedule
    private var scheduled = false
    private var desired: EditorConfirmation?
    private var shown: EditorConfirmation?
    private var closing = false
    private var generation = 0
    private var send: (SystemTextEditorIntent) -> Void = { _ in }

    init(surface: EditorConfirmationSurface, schedule: @escaping Schedule = { $0() }) {
        self.surface = surface; self.schedule = schedule
    }
    func update(view: SystemTextEditorView, send: @escaping (SystemTextEditorIntent) -> Void) {
        self.send = send
        desired = view.active && view.leave?.phase == .confirming
            ? view.leave.map { EditorConfirmation(sessionId: view.sessionId, leave: $0) } : nil
        reconcile()
    }
    func stop() { desired = nil; reconcile() }
    func reconcile() {
        if scheduled { return }
        scheduled = true
        // Retain a queued teardown until it can dismiss its surface, even after host removal.
        schedule { [self] in
            scheduled = false
            apply()
        }
    }
    private func apply() {
        if closing { return }
        if let shown {
            if let desired, shown.identity == desired.identity, shown.content == desired.content {
                surface.update(desired)
            } else {
                closing = true
                surface.dismiss()
            }
            return
        }
        guard let desired else { return }
        generation += 1
        let token = generation
        shown = desired
        if !surface.present(desired, choose: { [weak self] choice in
            guard let self, self.generation == token, !self.closing, self.shown != nil,
                  let latest = self.desired, latest.identity == desired.identity, latest.content == desired.content else { return }
            let action: SystemTextEditorView.Action
            switch choice {
            case .save: action = latest.leave.save
            case .discard: action = latest.leave.discard
            case .stay: action = latest.leave.stay
            }
            guard action.enabled && !action.pending else { return }
            self.closing = true
            self.desired = nil
            self.send(.init(.chooseLeave, session: desired.sessionId, leave: desired.leave.id, choice: choice))
        }, dismissed: { [weak self] in
            guard let self, self.generation == token else { return }
            self.shown = nil
            self.closing = false
            self.reconcile()
        }) { shown = nil }
    }
}

#if os(macOS)
import AppKit

@MainActor private final class EditorConfirmationAnchor: NSView {
    var ready: (() -> Void)?
    override func viewDidMoveToWindow() { super.viewDidMoveToWindow(); ready?() }
}

@MainActor private final class EditorConfirmationDriver: EditorConfirmationSurface {
    weak var anchor: NSView?
    private var alert: NSAlert?
    func present(_ request: EditorConfirmation, choose: @escaping (SystemTextEditorIntent.Choice) -> Void,
                 dismissed: @escaping () -> Void) -> Bool {
        guard let window = anchor?.window, window.attachedSheet == nil else { return false }
        let alert = NSAlert()
        alert.messageText = request.leave.title
        alert.informativeText = request.leave.message
        alert.alertStyle = .warning
        for action in [request.leave.save, request.leave.discard, request.leave.stay] {
            alert.addButton(withTitle: action.label).isEnabled = action.enabled
        }
        alert.buttons[1].hasDestructiveAction = true
        alert.buttons[2].keyEquivalent = "\u{1b}"
        self.alert = alert
        alert.beginSheetModal(for: window) { [weak self] response in
            self?.alert = nil
            if response == .alertFirstButtonReturn { choose(.save) }
            else if response == .alertSecondButtonReturn { choose(.discard) }
            else if response == .alertThirdButtonReturn { choose(.stay) }
            dismissed()
        }
        return true
    }
    func update(_ request: EditorConfirmation) {
        guard let alert else { return }
        for (button, action) in zip(alert.buttons, [request.leave.save, request.leave.discard, request.leave.stay]) {
            button.isEnabled = action.enabled
        }
    }
    func dismiss() {
        guard let alert, let window = alert.window.sheetParent else { return }
        window.endSheet(alert.window, returnCode: .abort)
    }
}

@available(macOS 14, *)
@MainActor private struct EditorConfirmationHost: NSViewRepresentable {
    let view: SystemTextEditorView
    let send: (SystemTextEditorIntent) -> Void
    @MainActor final class Coordinator {
        let driver = EditorConfirmationDriver()
        // AppKit sheet animation can run a nested layout loop. Never start it in a SwiftUI update.
        lazy var presentation = EditorConfirmationPresentation(surface: driver, schedule: { work in
            DispatchQueue.main.async(execute: work)
        })
    }
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeNSView(context: Context) -> EditorConfirmationAnchor {
        let anchor = EditorConfirmationAnchor()
        context.coordinator.driver.anchor = anchor
        anchor.ready = { [weak presentation = context.coordinator.presentation] in presentation?.reconcile() }
        return anchor
    }
    func updateNSView(_ anchor: EditorConfirmationAnchor, context: Context) {
        context.coordinator.presentation.update(view: view, send: send)
    }
    static func dismantleNSView(_ anchor: EditorConfirmationAnchor, coordinator: Coordinator) {
        anchor.ready = nil
        coordinator.presentation.stop()
    }
}
#elseif os(iOS)
import UIKit

@MainActor private final class EditorConfirmationAnchor: UIViewController {
    var ready: (() -> Void)?
    override func viewDidAppear(_ animated: Bool) { super.viewDidAppear(animated); ready?() }
}

@MainActor private final class EditorConfirmationDriver: EditorConfirmationSurface {
    weak var anchor: UIViewController?
    private var alert: UIAlertController?
    private var finished: (() -> Void)?
    func present(_ request: EditorConfirmation, choose: @escaping (SystemTextEditorIntent.Choice) -> Void,
                 dismissed: @escaping () -> Void) -> Bool {
        guard let anchor, anchor.view.window != nil, anchor.presentedViewController == nil else { return false }
        let alert = UIAlertController(title: request.leave.title, message: request.leave.message, preferredStyle: .alert)
        self.alert = alert
        finished = dismissed
        for (action, choice, style) in [
            (request.leave.save, SystemTextEditorIntent.Choice.save, UIAlertAction.Style.default),
            (request.leave.discard, .discard, .destructive),
            (request.leave.stay, .stay, .cancel)
        ] {
            let button = UIAlertAction(title: action.label, style: style) { [weak self] _ in
                choose(choice)
                self?.dismiss()
            }
            button.isEnabled = action.enabled
            alert.addAction(button)
        }
        anchor.present(alert, animated: true)
        return true
    }
    func update(_ request: EditorConfirmation) {
        guard let alert else { return }
        for (button, action) in zip(alert.actions, [request.leave.save, request.leave.discard, request.leave.stay]) {
            button.isEnabled = action.enabled
        }
    }
    func dismiss() {
        guard let alert else { return }
        self.alert = nil
        let finished = self.finished
        self.finished = nil
        alert.dismiss(animated: true) { finished?() }
    }
}

@available(iOS 17, *)
@MainActor private struct EditorConfirmationHost: UIViewControllerRepresentable {
    let view: SystemTextEditorView
    let send: (SystemTextEditorIntent) -> Void
    @MainActor final class Coordinator {
        let driver = EditorConfirmationDriver()
        lazy var presentation = EditorConfirmationPresentation(surface: driver)
    }
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIViewController(context: Context) -> EditorConfirmationAnchor {
        let anchor = EditorConfirmationAnchor()
        context.coordinator.driver.anchor = anchor
        anchor.ready = { [weak presentation = context.coordinator.presentation] in presentation?.reconcile() }
        return anchor
    }
    func updateUIViewController(_ anchor: EditorConfirmationAnchor, context: Context) {
        context.coordinator.presentation.update(view: view, send: send)
    }
    static func dismantleUIViewController(_ anchor: EditorConfirmationAnchor, coordinator: Coordinator) {
        anchor.ready = nil
        coordinator.presentation.stop()
    }
}
#endif

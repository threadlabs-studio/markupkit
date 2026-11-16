import SwiftUI

/// The serializable view produced by MarkupKit collectionView; the application owns its provider.
public struct SystemCollectionView: Decodable {
    public enum Schema: String, Decodable { case v1 = "markupkit.collection.v1" }
    public enum Status: String, Decodable { case ready, pending, empty, error }
    public struct Appearance: Decodable {
        public enum Spacing: String, Decodable { case system, compact, comfortable }
        public enum Typography: String, Decodable { case system, serif }
        public let spacing: Spacing
        public let typography: Typography
    }
    public struct Item: Decodable, Identifiable {
        public let key: String
        public let href: String
        public let label: String
        public let summary: String
        public let current: Bool
        public var id: String { key }
    }
    public let schema: Schema
    public let id: String
    public let label: String
    public let status: Status
    public let message: String
    public let appearance: Appearance
    public let items: [Item]
}

/// Activation proposes a destination; it does not change current selection or navigate locally.
public struct SystemCollectionActivation: Encodable {
    public let type = "activate-collection"
    public let collectionId: String
    public let key: String
    public let href: String

    public init(collectionId: String, key: String, href: String) {
        self.collectionId = collectionId; self.key = key; self.href = href
    }
}

/// Native list controls over the shared projection, with application-supplied recovery content.
/// The surrounding host supplies tint, navigation and accessibility preferences.
@available(macOS 14, iOS 17, *)
@MainActor public struct SystemCollection<Recovery: View>: View {
    public let view: SystemCollectionView
    private let activate: (SystemCollectionActivation) -> Void
    private let recovery: () -> Recovery

    public init(view: SystemCollectionView, activate: @escaping (SystemCollectionActivation) -> Void,
                @ViewBuilder recovery: @escaping () -> Recovery) {
        self.view = view; self.activate = activate; self.recovery = recovery
    }
    private var gap: CGFloat {
        switch view.appearance.spacing {
        case .system: return 4
        case .compact: return 2
        case .comfortable: return 8
        }
    }
    public var body: some View {
        List {
            Section(view.label) {
                switch view.status {
                case .pending: ProgressView(view.message).accessibilityIdentifier(view.id + "-status")
                case .empty: Text(view.message).accessibilityIdentifier(view.id + "-status")
                case .error: Label(view.message, systemImage: "exclamationmark.triangle").accessibilityIdentifier(view.id + "-status")
                case .ready: EmptyView()
                }
                ForEach(view.items) { item in
                    Button {
                        activate(.init(collectionId: view.id, key: item.key, href: item.href))
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: gap) {
                                Text(item.label).font(.headline)
                                if !item.summary.isEmpty { Text(item.summary).font(.subheadline).foregroundStyle(.secondary) }
                            }
                            Spacer()
                            if item.current { Image(systemName: "checkmark").foregroundStyle(.tint).accessibilityHidden(true) }
                        }
                        .fontDesign(view.appearance.typography == .serif ? .serif : .default)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(item.current ? .isSelected : [])
                    .accessibilityIdentifier(view.id + "-" + item.key)
                }
            }
            recovery()
        }
        .accessibilityIdentifier(view.id)
    }
}

@available(macOS 14, iOS 17, *)
extension SystemCollection where Recovery == EmptyView {
    public init(view: SystemCollectionView, activate: @escaping (SystemCollectionActivation) -> Void) {
        self.init(view: view, activate: activate, recovery: { EmptyView() })
    }
}

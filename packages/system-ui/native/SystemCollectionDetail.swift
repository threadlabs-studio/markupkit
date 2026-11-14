import SwiftUI

public enum SystemCollectionDetailRegion { case collection, detail }

/// The application supplies the committed region; native navigation only requests a change.
@available(macOS 14, iOS 17, *)
@MainActor public struct SystemCollectionDetail<Collection: View, Detail: View>: View {
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    #endif
    private let active: SystemCollectionDetailRegion
    private let request: (SystemCollectionDetailRegion) -> Void
    private let collection: () -> Collection
    private let detail: () -> Detail

    public init(active: SystemCollectionDetailRegion, request: @escaping (SystemCollectionDetailRegion) -> Void,
                @ViewBuilder collection: @escaping () -> Collection,
                @ViewBuilder detail: @escaping () -> Detail) {
        self.active = active; self.request = request
        self.collection = collection; self.detail = detail
    }
    public var body: some View {
        NavigationSplitView(preferredCompactColumn: Binding(
            get: { active == .collection ? .sidebar : .detail },
            set: { _ in }
        )) {
            collection()
        } detail: {
            #if os(iOS)
            detail()
                .navigationBarBackButtonHidden(true)
                .toolbar {
                    if horizontalSizeClass == .compact && active == .detail {
                        ToolbarItem(placement: .topBarLeading) {
                            Button { request(.collection) } label: { Label("Back", systemImage: "chevron.backward") }
                        }
                    }
                }
            #else
            detail()
            #endif
        }
    }
}

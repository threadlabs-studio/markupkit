import SwiftUI

@MainActor final class NavigationVisit: ObservableObject {
    let name: String
    @Published var active = true
    @Published var draft: String
    init(_ name: String, draft: String) { self.name = name; self.draft = draft }
}

struct NavigationProposal { let owner: String }

@MainActor final class NavigationFixture: ObservableObject {
    enum Mutation { case replace, remove, replaceAndRemove }
    let first = NavigationVisit("First", draft: "Original draft")
    let second = NavigationVisit("Second", draft: "Replacement draft")
    @Published var current: NavigationVisit
    @Published var mounted = true
    @Published var mutation: Mutation = .replace
    @Published var events: [String] = []
    init() { current = first }

    func begin(_ visit: NavigationVisit) -> NavigationProposal? {
        events.append("Begin \(visit.name)")
        let mutation = mutation
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [self] in
            switch mutation {
            case .replace: current = second
            case .remove: mounted = false
            case .replaceAndRemove:
                current = second
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [self] in mounted = false }
            }
        }
        return NavigationProposal(owner: visit.name)
    }
    func complete(_ visit: NavigationVisit, proposal: NavigationProposal, committed: Bool) {
        events.append("\(visit.name) received \(proposal.owner) \(committed ? "committed" : "cancelled")")
        if proposal.owner == visit.name && committed { visit.active = false }
    }
}

struct NavigationSurface: View {
    @ObservedObject var fixture: NavigationFixture
    @ObservedObject var visit: NavigationVisit
    var body: some View {
        SystemPageNavigation(active: { visit.active }, rootTitle: "Collection", detailTitle: visit.name,
            root: Text("Collection").accessibilityIdentifier("collection"),
            detail: Form { TextField("Draft", text: $visit.draft).accessibilityIdentifier("draft") },
            back: { visit.active = false },
            begin: { fixture.begin(visit) },
            complete: { proposal, committed in fixture.complete(visit, proposal: proposal, committed: committed) })
    }
}

@main struct NativeNavigationApp: App {
    @StateObject private var fixture = NavigationFixture()
    var body: some Scene {
        WindowGroup {
            VStack {
                HStack {
                    Button("Replace during swipe") { fixture.mutation = .replace }
                    Button("Remove during swipe") { fixture.mutation = .remove }
                }.buttonStyle(.bordered)
                Button("Replace then remove during swipe") { fixture.mutation = .replaceAndRemove }
                Text(fixture.events.joined(separator: "; ")).accessibilityIdentifier("events")
                if fixture.mounted { NavigationSurface(fixture: fixture, visit: fixture.current) }
                else { Text("Navigation removed").accessibilityIdentifier("removed"); Spacer() }
            }
        }
    }
}

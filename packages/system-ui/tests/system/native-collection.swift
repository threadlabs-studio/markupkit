import Foundation
import SwiftUI

@main struct CollectionProtocolChecks {
    @MainActor static func main() throws {
        let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
        let views = try JSONDecoder().decode([SystemCollectionView].self, from: data)
        precondition(views.map(\.status) == [.ready, .pending, .empty, .error])
        let ready = views[0]
        precondition(ready.items.map(\.key) == ["coast", "garden"])
        precondition(ready.items[0].current && !ready.items[1].current)
        precondition(ready.appearance.spacing == .comfortable && ready.appearance.typography == .serif)
        precondition(views[1].items.map(\.key) == ready.items.map(\.key))
        precondition(views[2].items.isEmpty && views[3].message == "Offline")
        let item = ready.items[1]
        let action = SystemCollectionActivation(collectionId: ready.id, key: item.key, href: item.href)
        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(action)) as! [String: String]
        precondition(encoded == ["type": "activate-collection", "collectionId": "notes", "key": "garden", "href": "/notes/garden/"])
        _ = SystemCollection(view: ready, activate: { _ in })
        let invalid = String(data: data, encoding: .utf8)!.replacingOccurrences(of: "markupkit.collection.v1", with: "markupkit.collection.v2")
        do {
            _ = try JSONDecoder().decode([SystemCollectionView].self, from: Data(invalid.utf8))
            preconditionFailure("Unknown collection schema accepted")
        } catch DecodingError.dataCorrupted { }
        print("Native collection decodes actual JavaScript projections and encodes activation. UI interaction remains separate.")
    }
}

#if os(macOS)
import AppKit

/// Reads resolved, opaque sRGB tokens exported by a Looma theme.
@MainActor public struct SystemLoomaPalette {
    public enum Scheme: String { case light, dark }
    public enum Role: String {
        case canvas = "--ui-surface"
        case surface = "--ui-surface-raised"
        case text = "--ui-text"
        case secondaryText = "--ui-text-secondary"
        case accent = "--ui-accent"
        case onAccent = "--ui-on-accent"
        case focus = "--ui-focus-ring"
        case selection = "--ui-selection-surface"
        case selectionText = "--ui-selection-text"
        case selectionBorder = "--ui-selection-border"
    }

    private let tokens: [String: String]

    public init(data: Data, scheme: Scheme) throws {
        let modes = try JSONDecoder().decode([String: [String: String]].self, from: data)
        guard let tokens = modes[scheme.rawValue] else { throw CocoaError(.fileReadCorruptFile) }
        self.tokens = tokens
    }

    public func color(_ role: Role, fallback: NSColor) -> NSColor {
        guard let hex = tokens[role.rawValue], hex.count == 7, hex.first == "#",
              hex.dropFirst().utf8.allSatisfy({ (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0) }),
              let value = UInt32(hex.dropFirst(), radix: 16) else { return fallback }
        return NSColor(srgbRed: CGFloat(value >> 16) / 255,
                       green: CGFloat((value >> 8) & 255) / 255,
                       blue: CGFloat(value & 255) / 255, alpha: 1)
    }
}
#endif

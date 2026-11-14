#if os(macOS)
import AppKit

/// A plain-text manuscript surface shared by reading and editing. The host owns
/// source versions and converts its anchors to UTF-16 ranges.
@MainActor public final class SystemManuscriptText: NSScrollView {
    public let editor: NSTextView
    public let paragraphStyle: NSParagraphStyle
    public var onGeometryChange: (() -> Void)?
    private var markedRange: NSRange?

    public init(font: NSFont, ink: NSColor, lineHeight: CGFloat, firstLineIndent: CGFloat, horizontalInset: CGFloat) {
        let style = NSMutableParagraphStyle()
        style.firstLineHeadIndent = firstLineIndent
        style.minimumLineHeight = lineHeight
        style.maximumLineHeight = lineHeight
        paragraphStyle = style
        let storage = NSTextStorage()
        let layout = NSLayoutManager()
        let container = NSTextContainer()
        storage.addLayoutManager(layout)
        layout.addTextContainer(container)
        container.widthTracksTextView = true
        container.lineFragmentPadding = 0
        editor = NSTextView(frame: .zero, textContainer: container)
        super.init(frame: .zero)
        editor.isRichText = false
        editor.isVerticallyResizable = true
        editor.autoresizingMask = [.width]
        editor.drawsBackground = false
        editor.textContainerInset = NSSize(width: horizontalInset, height: 0)
        editor.defaultParagraphStyle = paragraphStyle
        editor.typingAttributes = [.font: font, .foregroundColor: ink, .paragraphStyle: paragraphStyle]
        editor.font = font
        editor.textColor = ink
        editor.setAccessibilityLabel("Manuscript text")
        drawsBackground = false
        autohidesScrollers = true
        hasVerticalScroller = true
        documentView = editor
        contentView.postsBoundsChangedNotifications = true
        NotificationCenter.default.addObserver(self, selector: #selector(geometryChanged),
                                               name: NSView.boundsDidChangeNotification, object: contentView)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("Use init(font:ink:lineHeight:firstLineIndent:horizontalInset:)") }

    public func setText(_ text: String) {
        markedRange = nil
        editor.textStorage?.setAttributedString(NSAttributedString(string: text, attributes: editor.typingAttributes))
    }

    public func mark(_ range: NSRange?, color: NSColor) {
        guard let layout = editor.layoutManager else { return }
        let length = (editor.string as NSString).length
        if let previous = markedRange, NSMaxRange(previous) <= length {
            layout.removeTemporaryAttribute(.underlineStyle, forCharacterRange: previous)
            layout.removeTemporaryAttribute(.underlineColor, forCharacterRange: previous)
        }
        markedRange = nil
        guard let range, range.length > 0, range.location >= 0,
              range.location <= length, range.length <= length - range.location else { return }
        layout.addTemporaryAttributes([.underlineStyle: NSUnderlineStyle.single.rawValue, .underlineColor: color],
                                      forCharacterRange: range)
        markedRange = range
    }

    @objc private func geometryChanged() { onGeometryChange?() }

    /// Geometry is returned in the scroll view's coordinates only while visible.
    public func visibleAnchor(at character: Int) -> NSRect? {
        guard let layout = editor.layoutManager, let container = editor.textContainer,
              character >= 0, character < (editor.string as NSString).length else { return nil }
        layout.ensureLayout(for: container)
        let glyph = layout.glyphRange(forCharacterRange: NSRange(location: character, length: 1), actualCharacterRange: nil)
        let rect = layout.boundingRect(forGlyphRange: glyph, in: container)
            .offsetBy(dx: editor.textContainerOrigin.x, dy: editor.textContainerOrigin.y)
        guard editor.visibleRect.contains(rect) else { return nil }
        return convert(rect, from: editor)
    }
}
#endif

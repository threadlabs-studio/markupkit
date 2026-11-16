import XCTest

final class AccessibilityTests: XCTestCase {
    @MainActor @discardableResult private func check(_ condition: Bool, _ message: String,
                               file: StaticString = #filePath, line: UInt = #line) -> Bool {
        guard !condition else { return true }
        let context = XCTSourceCodeContext(callStack: [], location: XCTSourceCodeLocation(filePath: String(describing: file), lineNumber: Int(line)))
        record(XCTIssue(type: .assertionFailure, compactDescription: message, detailedDescription: nil,
                        sourceCodeContext: context, associatedError: nil, attachments: []))
        return false
    }
    @MainActor private func audit(_ app: XCUIApplication) {
        do {
            try app.performAccessibilityAudit(for: [.textClipped, .dynamicType]) { issue in
                self.check(false, "Native audit: \(issue.compactDescription): \(issue.detailedDescription)")
                return true
            }
        } catch { check(false, "Native audit could not run: \(error)") }
    }
    @MainActor private func capture(_ app: XCUIApplication, _ name: String) {
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); image.name = name; image.lifetime = .keepAlways; add(image)
        let tree = XCTAttachment(string: app.debugDescription); tree.name = name + " accessibility tree"; tree.lifetime = .keepAlways; add(tree)
    }
    @MainActor func testEditorLongLabelsGrowAndSaveRemainsReachable() {
        let app = XCUIApplication(); app.launch()
        let field = app.textViews["accessible-input"]
        guard check(field.waitForExistence(timeout: 10), "Editor missing") else { return }
        check(field.label == "Your note", "Native input lost its accessible name")
        audit(app)
        let save = app.buttons["accessible-save"]
        for _ in 0..<5 { if save.isHittable { break }; app.swipeUp() }
        guard check(save.isHittable, "Long-label Save is unreachable") else { return }
        capture(app, "Long native editor status and action")
        audit(app)
        save.tap()
        let status = app.staticTexts["accessible-note-status"]
        let result = XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "All your changes have been saved on this device"), object: status)], timeout: 5)
        check(result == .completed, "Save did not reach the application callback")
    }
    @MainActor func testCollectionLongTextAndSelectedTrait() {
        let app = XCUIApplication(); app.launchArguments = ["--collection"]; app.launch()
        let first = app.buttons["accessible-notes-first"], second = app.buttons["accessible-notes-second"]
        guard check(first.waitForExistence(timeout: 10), "Collection missing") else { return }
        check(first.isSelected, "Current row lacks selected accessibility trait")
        audit(app)
        for _ in 0..<5 { if second.isHittable { break }; app.swipeUp() }
        guard check(second.isHittable, "Second long row is unreachable") else { return }
        second.tap()
        check(second.isSelected, "Activation did not preserve selected semantics")
        capture(app, "Long native collection rows")
        audit(app)
    }
    @MainActor func testTextSizeChangeRetainsDraftAndKeyboardFocus() {
        let app = XCUIApplication(); app.launchArguments = ["--resize"]; app.launch()
        let field = app.textViews["accessible-input"]
        guard check(field.waitForExistence(timeout: 10), "Editor missing") else { return }
        field.tap(); field.typeText("Before resizing")
        let initial = field.value as? String
        if initial != "Before resizing" { capture(app, "Initial resizing input diagnostic") }
        guard check(initial == "Before resizing", "Initial draft input changed: \(String(describing: initial))") else { return }
        app.buttons["Largest text"].tap()
        field.typeText(" after resizing")
        guard check(field.value as? String == "Before resizing after resizing", "Draft or focus lost while text grew") else { return }
        app.buttons["Standard text"].tap()
        field.typeText(" restored")
        check(field.value as? String == "Before resizing after resizing restored", "Draft or focus lost while text shrank")
        capture(app, "Native draft and focus survive text size changes")
    }

}

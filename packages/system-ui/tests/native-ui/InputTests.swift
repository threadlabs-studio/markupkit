import XCTest

final class InputTests: XCTestCase {
    @MainActor private func expectValue(_ expected: String, in field: XCUIElement,
                                       file: StaticString = #filePath, line: UInt = #line) -> Bool {
        let actual = field.value as? String
        guard actual != expected else { return true }
        // An explicit location avoids the toolchain's stalled lazy stack symbolication.
        let context = XCTSourceCodeContext(callStack: [], location: XCTSourceCodeLocation(filePath: String(describing: file), lineNumber: Int(line)))
        record(XCTIssue(type: .assertionFailure, compactDescription: "Expected \(expected.debugDescription), got \(String(describing: actual))",
                        detailedDescription: nil, sourceCodeContext: context, associatedError: nil, attachments: []))
        return false
    }
    @MainActor func testCoalescedEditDeletionThenExternalRestoration() {
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        app.buttons["Coalesce projections"].tap()
        let field = app.textViews["native-input"]
        field.tap(); field.typeText("a" + XCUIKeyboardKey.delete.rawValue)
        let projected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != %@", "Projection 0"), object: app.staticTexts["projection"])
        XCTAssertEqual(XCTWaiter.wait(for: [projected], timeout: 5), .completed)
        guard expectValue("", in: field) else { return }
        app.buttons["Restore a"].tap()
        guard expectValue("a", in: field) else { return }
    }
    @MainActor func testDelayedProjectionRetainsNewerKeystrokes() {
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        app.buttons["Delay projections"].tap()
        let field = app.textViews["native-input"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        let draft = "Delayed projections must retain every native keystroke."
        field.tap(); field.typeText(draft)
        guard expectValue(draft, in: field) else { return }
        app.buttons["External value"].tap()
        guard expectValue("Provider replacement", in: field) else { return }
        app.buttons["Next session"].tap()
        guard expectValue("", in: field) else { return }
    }
    @MainActor func testRapidTypingExternalValueAndNewSession() {
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        let field = app.textViews["native-input"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        let draft = "Native input must retain every character.\nA second line."
        field.tap(); field.typeText(draft)
        guard expectValue(draft, in: field) else { return }
        app.buttons["External value"].tap()
        guard expectValue("Provider replacement", in: field) else { return }
        app.buttons["Next session"].tap()
        guard expectValue("", in: field) else { return }
        field.tap(); field.typeText("A fresh session draft")
        guard expectValue("A fresh session draft", in: field) else { return }
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = "Native input after session replacement"; image.lifetime = .keepAlways
        add(image)
    }
}

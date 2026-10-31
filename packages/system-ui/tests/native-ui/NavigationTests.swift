import XCTest

final class NavigationTests: XCTestCase {
    @MainActor @discardableResult private func check(_ condition: Bool, _ message: String,
                               file: StaticString = #filePath, line: UInt = #line) -> Bool {
        guard !condition else { return true }
        let context = XCTSourceCodeContext(callStack: [], location: XCTSourceCodeLocation(filePath: String(describing: file), lineNumber: Int(line)))
        record(XCTIssue(type: .assertionFailure, compactDescription: message, detailedDescription: nil,
                        sourceCodeContext: context, associatedError: nil, attachments: []))
        return false
    }
    @MainActor private func swipe(_ app: XCUIApplication, cancelled: Bool = false) {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.003, dy: 0.42))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: cancelled ? 0.23 : 0.92, dy: 0.42))
        start.press(forDuration: 0.1, thenDragTo: end, withVelocity: XCUIGestureVelocity(rawValue: 250), thenHoldForDuration: 0.6)
    }
    @MainActor private func waitFor(_ text: String, in app: XCUIApplication) -> Bool {
        let result = XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", text), object: app.staticTexts["events"])], timeout: 5)
        return check(result == .completed, "Missing \(text); events: \(app.staticTexts["events"].label)")
    }
    @MainActor func testReplacementCompletesTheOriginalOwnerAndRetainsNewVisit() {
        let app = XCUIApplication(); app.launch()
        guard check(app.textFields["draft"].waitForExistence(timeout: 10), "Initial native editor missing") else { return }
        app.buttons["Replace during swipe"].tap()
        swipe(app)
        guard waitFor("First received First committed", in: app) else { return }
        check(!app.staticTexts["events"].label.contains("Second received"), "Old gesture completed on replacement owner")
        let field = app.textFields["draft"]
        guard check(field.waitForExistence(timeout: 5), "Replacement detail was popped") else { return }
        check(field.value as? String == "Replacement draft", "Replacement draft lost: \(String(describing: field.value))")
        field.tap(); field.typeText(" continues")
        check(field.value as? String == "Replacement draft continues", "Replacement editor cannot continue typing")
        let capture = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); capture.name = "Replacement visit survives old native completion"; capture.lifetime = .keepAlways; add(capture)
    }
    @MainActor func testRemovingHostCancelsItsPendingProposalExactlyOnce() {
        let app = XCUIApplication(); app.launch()
        guard check(app.textFields["draft"].waitForExistence(timeout: 10), "Initial native editor missing") else { return }
        app.buttons["Remove during swipe"].tap()
        swipe(app)
        guard check(app.staticTexts["removed"].waitForExistence(timeout: 5), "Host removal did not occur during gesture") else { return }
        guard waitFor("First received First cancelled", in: app) else { return }
        let events = app.staticTexts["events"].label
        check(events.components(separatedBy: "received").count == 2, "Pending proposal completed more than once: \(events)")
        check(!events.contains("committed"), "Removed host committed a native pop")
        let capture = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); capture.name = "Removed native host cancels proposal once"; capture.lifetime = .keepAlways; add(capture)
    }
    @MainActor func testReplacementDuringCancelledGestureRetainsTheNewVisit() {
        let app = XCUIApplication(); app.launch()
        guard check(app.textFields["draft"].waitForExistence(timeout: 10), "Initial native editor missing") else { return }
        app.buttons["Replace during swipe"].tap()
        swipe(app, cancelled: true)
        guard waitFor("First received First cancelled", in: app) else { return }
        check(!app.staticTexts["events"].label.contains("Second received"), "Cancellation reached replacement owner")
        let field = app.textFields["draft"]
        guard check(field.waitForExistence(timeout: 5), "Replacement detail was lost on cancellation") else { return }
        check(field.value as? String == "Replacement draft", "Replacement draft lost on cancellation")
    }
    @MainActor func testReplacementThenRemovalCancelsTheOriginalOwner() {
        let app = XCUIApplication(); app.launch()
        guard check(app.textFields["draft"].waitForExistence(timeout: 10), "Initial native editor missing") else { return }
        app.buttons["Replace then remove during swipe"].tap()
        swipe(app)
        guard check(app.staticTexts["removed"].waitForExistence(timeout: 5), "Host removal missing") else { return }
        guard waitFor("First received First cancelled", in: app) else { return }
        let events = app.staticTexts["events"].label
        check(!events.contains("Second received"), "Disposal cancellation reached replacement owner")
        check(events.components(separatedBy: "received").count == 2, "Disposed proposal completed more than once: \(events)")
    }

}

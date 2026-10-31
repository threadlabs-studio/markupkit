import XCTest

final class CompositionTests: XCTestCase {
    @MainActor @discardableResult private func check(_ condition: Bool, _ message: String,
                               file: StaticString = #filePath, line: UInt = #line) -> Bool {
        guard !condition else { return true }
        let context = XCTSourceCodeContext(callStack: [], location: XCTSourceCodeLocation(filePath: String(describing: file), lineNumber: Int(line)))
        record(XCTIssue(type: .assertionFailure, compactDescription: message, detailedDescription: nil,
                        sourceCodeContext: context, associatedError: nil, attachments: []))
        return false
    }
    @MainActor private func state(_ app: XCUIApplication) -> [String: Any] {
        app.buttons["Inspect composition"].tap()
        let text = app.staticTexts["composition-state"].label
        return (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any] ?? [:]
    }
    @MainActor private func begin(_ app: XCUIApplication) -> Bool {
        app.launchArguments = ["--composition"]; app.launch()
        let field = app.textViews["native-input"]
        guard check(field.waitForExistence(timeout: 10), "Native editor missing") else { return false }
        field.tap(); app.buttons["Start marked text"].tap()
        let result = state(app)
        return check(result["marked"] as? String == "に", "UIKit marked-text setup failed: \(result)")
    }
    @MainActor func testStateAndThemeUpdatesRetainNativeCompositionControl() {
        let app = XCUIApplication(); guard begin(app) else { return }
        app.buttons["Status update"].tap()
        var result = state(app)
        check(result["marked"] as? String == "に", "Status update retired marked text: \(result)")
        check(result["native"] as? String == "に", "Status update replaced composition: \(result)")
        app.buttons["Serif appearance"].tap()
        result = state(app)
        check(result["marked"] as? String == "に", "Theme update retired marked text: \(result)")
        check(result["native"] as? String == "に", "Theme update lost native text: \(result)")
        check(result["sameControl"] as? Bool == true, "Theme update replaced native input: \(result)")
        check(result["focused"] as? Bool == true, "Theme update lost keyboard focus: \(result)")
        let attachment = XCTAttachment(string: String(describing: result)); attachment.name = "Native composition after state and theme updates"; attachment.lifetime = .keepAlways; add(attachment)
    }
    @MainActor func testUnmarkThenKeyboardInputPublishesTheCompleteDraft() {
        let app = XCUIApplication(); guard begin(app) else { return }
        app.buttons["Status update"].tap(); app.buttons["Serif appearance"].tap()
        app.buttons["Finish marked text"].tap()
        app.textViews["native-input"].typeText("!")
        let result = state(app)
        check(result["native"] as? String == "に!", "Native continuation changed composed text: \(result)")
        check(result["draft"] as? String == "に!", "Application did not receive complete draft: \(result)")
        check(result["marked"] is NSNull, "Finished input remains marked: \(result)")
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); attachment.name = "Composed text and continued native input"; attachment.lifetime = .keepAlways; add(attachment)
    }
}

import XCTest

final class AdaptationTests: XCTestCase {
    @MainActor private func state(_ app: XCUIApplication) throws -> [String: Any] {
        app.buttons["Inspect input"].tap()
        let text = app.staticTexts["adaptation-state"].label
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any])
    }
    @MainActor private func capture(_ app: XCUIApplication, _ name: String, _ state: [String: Any]) {
        let label = app.launchArguments.contains("--platform-split") ? "Platform " + name : "System UI " + name
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        image.name = label; image.lifetime = .keepAlways; add(image)
        let snapshot = XCTAttachment(string: String(describing: state))
        snapshot.name = label + " native input"; snapshot.lifetime = .keepAlways; add(snapshot)
    }
    @MainActor func testRotationRetainsInputAndMatchesPlatformFocus() throws {
        let platformFocus = try exercise(platform: true)
        let systemFocus = try exercise(platform: false)
        XCTAssertEqual(systemFocus, platformFocus, "System UI changed the platform split-view focus outcome")
    }
    @MainActor private func exercise(platform: Bool) throws -> [Bool] {
        XCUIDevice.shared.orientation = .portrait
        defer { XCUIDevice.shared.orientation = .portrait }
        let app = XCUIApplication(); app.launchArguments = platform ? ["--platform-split"] : []; app.launch()
        let field = app.textViews["native-input"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap(); field.typeText("A draft across layouts")
        app.buttons["Remember input"].tap()
        let portrait = try state(app)
        XCTAssertEqual(portrait["focused"] as? Bool, true)
        XCTAssertEqual(portrait["native"] as? String, "A draft across layouts")
        XCTAssertEqual(portrait["selectionStart"] as? Int, 2)
        XCTAssertEqual(portrait["selectionLength"] as? Int, 4)
        XCTAssertFalse(app.staticTexts["adaptation-collection"].isHittable)
        capture(app, "Portrait input before adaptation", portrait)
        let width = field.frame.width
        XCUIDevice.shared.orientation = .landscapeLeft
        let changed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in app.frame.width > app.frame.height }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 10), .completed)
        let landscape = try state(app)
        XCTAssertEqual(landscape["sizeClass"] as? Int, 2)
        XCTAssertTrue(app.staticTexts["adaptation-collection"].isHittable)
        capture(app, "Landscape input after adaptation", landscape)
        XCUIDevice.shared.orientation = .portrait
        let restored = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in abs(field.frame.width - width) < 5 }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [restored], timeout: 10), .completed)
        let returned = try state(app)
        XCTAssertEqual(returned["sizeClass"] as? Int, 1)
        XCTAssertFalse(app.staticTexts["adaptation-collection"].isHittable)
        capture(app, "Portrait input after adaptation", returned)
        for snapshot in [landscape, returned] {
            XCTAssertEqual(snapshot["sameControl"] as? Bool, true)
            XCTAssertEqual(snapshot["native"] as? String, "A draft across layouts")
            XCTAssertEqual(snapshot["draft"] as? String, "A draft across layouts")
            XCTAssertEqual(snapshot["session"] as? String, "first")
            XCTAssertEqual(snapshot["requests"] as? Int, 0)
            XCTAssertEqual(snapshot["selectionStart"] as? Int, 2)
            XCTAssertEqual(snapshot["selectionLength"] as? Int, 4)
        }
        // Split-view adaptation may dismiss the keyboard; observe it before explicitly refocusing.
        field.tap()
        app.buttons["Remember input"].tap()
        field.typeText("new")
        let continued = try state(app)
        XCTAssertEqual(continued["native"] as? String, "A newt across layouts")
        XCTAssertEqual(continued["draft"] as? String, "A newt across layouts")
        return try [landscape, returned].map { try XCTUnwrap($0["focused"] as? Bool) }
    }
}

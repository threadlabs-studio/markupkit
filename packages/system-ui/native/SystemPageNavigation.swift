#if os(iOS)
import SwiftUI
import UIKit

/// One application-owned navigation action, rendered with native navigation-bar chrome.
@MainActor public struct SystemNavigationAction {
    public let title: String
    public let systemImage: String
    public let perform: () -> Void

    public init(_ title: String, systemImage: String, perform: @escaping () -> Void) {
        self.title = title; self.systemImage = systemImage; self.perform = perform
    }
}

/// A controlled native stack. The application authorizes Back and owns the committed destination.
/// The opaque proposal returns unchanged with the actual platform outcome, including cancellation.
@available(iOS 17, *)
@MainActor public struct SystemPageNavigation<Root: View, Detail: View, Proposal>: UIViewControllerRepresentable {
    let active: () -> Bool
    let rootTitle: String
    let detailTitle: String
    let tint: Color
    let root: Root
    let detail: Detail
    let back: () -> Void
    let action: SystemNavigationAction?
    let backTitle: String
    let begin: () -> Proposal?
    let complete: (Proposal, Bool) -> Void

    public init(active: @escaping () -> Bool, rootTitle: String, detailTitle: String,
                tint: Color = .accentColor, backTitle: String = "Back",
                root: Root, detail: Detail, back: @escaping () -> Void,
                action: SystemNavigationAction? = nil,
                begin: @escaping () -> Proposal?, complete: @escaping (Proposal, Bool) -> Void) {
        self.active = active; self.rootTitle = rootTitle; self.detailTitle = detailTitle
        self.tint = tint; self.backTitle = backTitle; self.root = root; self.detail = detail
        self.back = back; self.action = action; self.begin = begin; self.complete = complete
    }

    public func makeCoordinator() -> Coordinator { Coordinator(self) }
    public func makeUIViewController(context: Context) -> UINavigationController { context.coordinator.navigation }
    public func updateUIViewController(_ controller: UINavigationController, context: Context) { context.coordinator.update(self) }
    public static func dismantleUIViewController(_ controller: UINavigationController, coordinator: Coordinator) { coordinator.dispose() }

    public final class Coordinator: NSObject, UINavigationControllerDelegate, UIGestureRecognizerDelegate {
        var owner: SystemPageNavigation
        let root: UIHostingController<AnyView>
        let detail: UIHostingController<AnyView>
        let navigation: UINavigationController
        private var proposal: (value: Proposal, complete: (Proposal, Bool) -> Void)?
        private var observingTransition = false
        private var actionIdentity: String?
        init(_ owner: SystemPageNavigation) {
            self.owner = owner
            root = UIHostingController(rootView: AnyView(owner.root))
            detail = UIHostingController(rootView: AnyView(owner.detail.navigationBarBackButtonHidden(true)))
            navigation = UINavigationController()
            super.init()
            navigation.delegate = self
            navigation.setViewControllers(owner.active() ? [root, detail] : [root], animated: false)
            navigation.loadViewIfNeeded()
            navigation.interactivePopGestureRecognizer?.delegate = self
            navigation.interactivePopGestureRecognizer?.addTarget(self, action: #selector(gestureChanged))
            detail.navigationItem.hidesBackButton = true
            detail.navigationItem.leftBarButtonItem = UIBarButtonItem(title: owner.backTitle, primaryAction: UIAction { [weak self] _ in self?.owner.back() })
            update(owner)
        }
        func update(_ owner: SystemPageNavigation) {
            self.owner = owner
            root.rootView = AnyView(owner.root)
            detail.rootView = AnyView(owner.detail.navigationBarBackButtonHidden(true))
            root.title = owner.rootTitle; detail.title = owner.detailTitle
            navigation.view.tintColor = UIColor(owner.tint)
            detail.navigationItem.leftBarButtonItem?.title = owner.backTitle
            let actionIdentity = owner.action.map { $0.title + "\u{0}" + $0.systemImage }
            if self.actionIdentity != actionIdentity {
                self.actionIdentity = actionIdentity
                for controller in [root, detail] {
                    controller.navigationItem.rightBarButtonItem = owner.action.map { action in
                        let item = UIBarButtonItem(image: UIImage(systemName: action.systemImage), primaryAction: UIAction(title: action.title) { [weak self] _ in self?.owner.action?.perform() })
                        item.accessibilityLabel = action.title
                        return item
                    }
                }
            }
            guard proposal == nil, navigation.transitionCoordinator == nil else { return }
            let shown = navigation.topViewController === detail
            if owner.active() != shown {
                navigation.setViewControllers(owner.active() ? [root, detail] : [root], animated: navigation.view.window != nil)
            }
            navigation.interactivePopGestureRecognizer?.isEnabled = owner.active()
        }
        public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard proposal == nil, navigation.transitionCoordinator == nil, navigation.topViewController === detail else { return false }
            let complete = owner.complete
            proposal = owner.begin().map { ($0, complete) }
            return proposal != nil
        }
        public func navigationController(_ navigationController: UINavigationController, willShow viewController: UIViewController, animated: Bool) {
            guard proposal != nil, let transition = navigationController.transitionCoordinator else { return }
            observingTransition = transition.animate(alongsideTransition: nil) { [weak self] context in self?.settle(!context.isCancelled) }
        }
        public func navigationController(_ navigationController: UINavigationController, didShow viewController: UIViewController, animated: Bool) {
            if proposal != nil && !observingTransition { settle(viewController === root) }
            navigation.interactivePopGestureRecognizer?.isEnabled = owner.active()
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                update(owner)
            }
        }
        @objc private func gestureChanged(_ gesture: UIGestureRecognizer) {
            if gesture.state == .ended || gesture.state == .cancelled {
                DispatchQueue.main.async { [weak self] in
                    guard let self, proposal != nil, !observingTransition, navigation.transitionCoordinator == nil else { return }
                    settle(navigation.topViewController === root)
                }
            }
        }
        private func settle(_ committed: Bool) {
            guard let proposal else { return }
            self.proposal = nil; observingTransition = false
            proposal.complete(proposal.value, committed)
            if committed && owner.active() { navigation.setViewControllers([root, detail], animated: false) }
        }
        func dispose() {
            if let proposal {
                self.proposal = nil
                DispatchQueue.main.async { proposal.complete(proposal.value, false) }
            }
            navigation.interactivePopGestureRecognizer?.removeTarget(self, action: #selector(gestureChanged))
            navigation.interactivePopGestureRecognizer?.delegate = nil
            navigation.delegate = nil
        }
    }
}
#endif

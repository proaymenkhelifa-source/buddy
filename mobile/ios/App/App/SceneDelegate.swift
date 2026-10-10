import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // Appli fermée, ouverte par un raccourci de l'icône (appui long sur Buddy) : la page le lira au démarrage
        if let shortcut = connectionOptions.shortcutItem {
            _ = openShortcut(shortcut)
        }
    }

    // Raccourci de l'icône touché alors que l'appli tournait déjà en arrière-plan
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        completionHandler(openShortcut(shortcutItem))
    }

    // Les raccourcis (UIApplicationShortcutItems dans Info.plist) sont passés à la page comme un lien "buddy://new-task"
    // ou "buddy://chat" : le module App de Capacitor le donne à la page (appUrlOpen / getLaunchUrl, voir public/app.js).
    private func openShortcut(_ shortcut: UIApplicationShortcutItem) -> Bool {
        guard let url = URL(string: "buddy://" + shortcut.type) else { return false }
        return ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

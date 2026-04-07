import ExpoModulesCore

public final class ReactNativeWidgetExtensionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReactNativeWidgetExtension")

    Function("areActivitiesEnabled") {
      false
    }

    Function("startActivity") { (_ args: [Any]) in
      // Live Activities are out of scope for the first widget MVP.
    }

    Function("updateActivity") { (_ args: [Any]) in
      // Live Activities are out of scope for the first widget MVP.
    }

    Function("endActivity") { (_ args: [Any]) in
      // Live Activities are out of scope for the first widget MVP.
    }
  }
}

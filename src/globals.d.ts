// Tauri's global API (app.withGlobalTauri = true), so plain ES modules need no bundler.
interface Window {
  __TAURI__: {
    window: typeof import("@tauri-apps/api/window");
    core: typeof import("@tauri-apps/api/core");
    event: typeof import("@tauri-apps/api/event");
    dpi: typeof import("@tauri-apps/api/dpi");
  };
}

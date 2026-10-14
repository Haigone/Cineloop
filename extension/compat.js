// Firefox: the code is written against `chrome.*` with promises; Firefox's own
// `browser.*` namespace is the same API, promise-based, so use it there.
// Loaded first in every page and content script. A no-op in Chrome.
if (typeof globalThis.browser !== "undefined" && globalThis.browser?.runtime?.id) {
  try {
    globalThis.chrome = globalThis.browser;
  } catch {
    // Read-only global: Firefox's `chrome` returns promises in Manifest V3 too.
  }
}

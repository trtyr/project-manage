/**
 * B10: the single mutation-error toast registry.
 *
 * main.tsx's MutationCache.onError calls `showMutationError` with the
 * classified message (classifyApiError); <MutationToastBridge/> inside
 * App.tsx registers the theme-aware antd message API instance. Keeping
 * the registry in its own module avoids a main↔App import cycle.
 */
let showMutationError: (msg: string) => void = () => undefined

export function registerMutationErrorToast(fn: (msg: string) => void) {
  showMutationError = fn
}

export function emitMutationError(msg: string) {
  showMutationError(msg)
}

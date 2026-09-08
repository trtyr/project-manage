/**
 * Copy text to the clipboard, with a fallback for plain-HTTP origins.
 *
 * `navigator.clipboard` exists only in secure contexts (HTTPS or
 * `localhost`) — this app is routinely served over plain HTTP from the
 * Tailscale/LAN IP, where the property is `undefined` and a bare
 * `navigator.clipboard.writeText(...)` throws synchronously, killing every
 * copy button. On those origins the legacy `document.execCommand('copy')`
 * path is the only way to reach the clipboard; it needs the textarea in
 * the DOM and a user gesture (which a button click provides).
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied / focus race — fall through to execCommand.
    }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  // Keep it invisible but selectable; fixed-position avoids a scroll jump
  // on iOS Safari, and `readonly` stops mobile keyboards from opening.
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  ta.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  return ok
}

# B10 offline probe — recorded run (2026-09-04, after 3d4a464)

All mutating `/api/*` requests aborted via playwright route interception
(reads unaffected).

```text
[1] AssetsTab delete toasts: ["Network Error"]
[2] ProjectDetail edit toasts: ["Network Error"]
[3] Task create toasts: ["Network Error"] | modal open: true
```

- [1]/[2] are two of the seven mutations the goal auditor flagged as
  still silent under the per-handler approach (AssetsTab `deleteAssetMut`,
  ProjectDetail `updateMut`) — the global `MutationCache.onError` boundary
  now covers every `useMutation` in the app.
- Exactly ONE toast per failure: the 31 redundant per-mutation
  `onError: () => message.error(...)` handlers were removed so nothing
  double-fires; the boundary calls `classifyApiError(err).message`
  (the offline kind surfaced above as axios's `Network Error`).
- [3] failed create keeps the modal open (input preserved) while the
  toast explains the failure.

Reproduce: `node b10-probe.js` (needs the server + a throwaway account,
see ../README.md; the probe deletes nothing — requests are aborted).

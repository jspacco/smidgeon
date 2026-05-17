let lock: WakeLockSentinel | null = null

export async function acquireWakeLock(): Promise<void> {
  if (!('wakeLock' in navigator)) return
  try {
    lock = await navigator.wakeLock.request('screen')
  } catch {
    // wakeLock not available — not a hard failure
  }
}

export async function releaseWakeLock(): Promise<void> {
  await lock?.release()
  lock = null
}

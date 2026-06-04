let wakeLockRef: WakeLockSentinel | null = null

export async function acquireWakeLock(): Promise<void> {
  if ('wakeLock' in navigator) {
    try {
      wakeLockRef = await navigator.wakeLock.request('screen')
    } catch {
      // Non-fatal — device may not support it
    }
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (wakeLockRef) {
    try {
      await wakeLockRef.release()
    } catch {
      // Non-fatal
    } finally {
      wakeLockRef = null
    }
  }
}

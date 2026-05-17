interface ReconnectingIndicatorProps {
  isConnected: boolean
}

export function ReconnectingIndicator({ isConnected }: ReconnectingIndicatorProps) {
  if (isConnected) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-50 bg-yellow-400 text-yellow-900 text-center py-2 text-sm font-medium"
    >
      Reconnecting… your responses are safe
    </div>
  )
}

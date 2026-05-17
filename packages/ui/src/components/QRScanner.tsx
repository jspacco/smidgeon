import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

interface QRScannerProps {
  onScan: (token: string) => void
  onError?: (err: string) => void
}

export function QRScanner({ onScan, onError }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const scanningRef = useRef(true)

  useEffect(() => {
    let stream: MediaStream | null = null
    let animFrame: number

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        scanFrame()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Camera unavailable'
        setCameraError(msg)
        onError?.(msg)
      }
    }

    function scanFrame() {
      if (!scanningRef.current) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animFrame = requestAnimationFrame(scanFrame)
        return
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)

      if (code) {
        scanningRef.current = false
        onScan(code.data)
        return
      }

      animFrame = requestAnimationFrame(scanFrame)
    }

    startCamera()

    return () => {
      scanningRef.current = false
      cancelAnimationFrame(animFrame)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onScan, onError])

  if (cameraError) {
    return (
      <div role="alert" className="text-red-600 text-sm p-4 text-center">
        Camera error: {cameraError}. Please allow camera access and try again.
      </div>
    )
  }

  return (
    <div className="relative">
      <video
        ref={videoRef}
        className="w-full rounded-lg"
        muted
        playsInline
        aria-label="Camera viewfinder for QR scanning"
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

import { useEffect, useRef } from 'react'
import QRCodeLib from 'qrcode'

interface QRCodeProps {
  value: string
  size?: number
}

export function QRCode({ value, size = 256 }: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    QRCodeLib.toCanvas(canvas, value, { width: size, margin: 2 }).catch(console.error)
  }, [value, size])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      aria-label="QR code for session attendance"
      role="img"
    />
  )
}

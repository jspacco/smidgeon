import { useEffect, useRef } from 'react'
import QRCodeLib from 'qrcode'

interface QRCodeProps {
  value: string
  size?: number
  colorDark?: string
  colorLight?: string
  margin?: number
}

export function QRCode({
  value,
  size = 256,
  colorDark = '#000000',
  colorLight = '#ffffff',
  margin = 2,
}: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    QRCodeLib.toCanvas(canvas, value, {
      width: size,
      margin,
      color: { dark: colorDark, light: colorLight },
    }).catch(console.error)
  }, [value, size, colorDark, colorLight, margin])

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

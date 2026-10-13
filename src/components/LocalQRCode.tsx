import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export interface LocalQRCodeProps {
  value: string
  size?: number
  className?: string
  alt?: string
  colorDark?: string
  colorLight?: string
}

/**
 * Componente de renderização LOCAL de QR Code (sem qualquer dependência de API externa).
 * Utiliza a biblioteca client-side `qrcode` para gerar Data URL em canvas/svg/png offline e instantâneo.
 */
export const LocalQRCode: React.FC<LocalQRCodeProps> = ({
  value,
  size = 250,
  className = '',
  alt = 'QR Code',
  colorDark = '#000000',
  colorLight = '#ffffff',
}) => {
  const [dataUrl, setDataUrl] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    if (!value) {
      setDataUrl('')
      return
    }

    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: colorDark,
        light: colorLight,
      },
    })
      .then((url) => {
        if (isMounted) {
          setDataUrl(url)
          setError(null)
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Erro ao gerar QR Code localmente:', err)
          setError('Erro ao gerar QR code')
        }
      })

    return () => {
      isMounted = false
    }
  }, [value, size, colorDark, colorLight])

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 text-xs text-red-500 rounded-lg p-2 ${className}`}
        style={{ width: size, height: size }}
      >
        {error}
      </div>
    )
  }

  if (!dataUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 animate-pulse rounded-lg ${className}`}
        style={{ width: size, height: size }}
      >
        <span className="text-[11px] text-muted-foreground">Gerando QR...</span>
      </div>
    )
  }

  return (
    <img src={dataUrl} alt={alt} width={size} height={size} className={className} loading="eager" />
  )
}

import React, { useRef, useState, useEffect } from 'react'
import { Camera, Upload, FileText, Image as ImageIcon, X, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { pb } from '@/lib/pocketbase/client'

export interface AnexoUploadFieldProps {
  label?: string
  helperText?: string
  currentFileUrl?: string | null
  currentFileName?: string | null
  selectedFile: File | null
  onFileSelect: (file: File | null) => void
  onRemoveCurrent?: () => void
  isRemovingCurrent?: boolean
  disabled?: boolean
  className?: string
  collectionNameOrId?: string
  recordId?: string
}

export function AnexoUploadField({
  label = 'Anexo (PDF ou Imagem)',
  helperText = 'Aceita PDF ou imagem do dispositivo/câmera (até 15MB)',
  currentFileUrl,
  currentFileName,
  selectedFile,
  onFileSelect,
  onRemoveCurrent,
  isRemovingCurrent,
  disabled = false,
  className = '',
  collectionNameOrId,
  recordId,
}: AnexoUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Atualiza preview se for arquivo local
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null)
      return
    }

    if (selectedFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(selectedFile)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setPreviewUrl(null)
    }
  }, [selectedFile])

  // Determina URL para arquivo já salvo no PocketBase se não foi passada pronta
  const existingFileUrl =
    currentFileUrl ||
    (collectionNameOrId && recordId && currentFileName
      ? pb.files.getURL(
          { id: recordId, collectionName: collectionNameOrId } as any,
          currentFileName,
        )
      : null)

  const isExistingImage =
    currentFileName &&
    (/\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(currentFileName) ||
      currentFileUrl?.match(/\.(jpg|jpeg|png|webp|gif|heic|heif)/i))

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files[0]) {
      onFileSelect(files[0])
    }
    // Reseta o input para permitir selecionar o mesmo arquivo se reaberto
    e.target.value = ''
  }

  const handleClearSelected = () => {
    onFileSelect(null)
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <Label className="text-xs font-semibold text-stone-700">{label}</Label>}

      {/* Hidden inputs para seleção de arquivo e câmera nativa */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        className="hidden"
        disabled={disabled}
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabled}
        onChange={handleFileChange}
      />

      {/* Exibição de arquivo já selecionado agora */}
      {selectedFile ? (
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-orange-200 bg-orange-50/50">
          <div className="flex items-center gap-2.5 min-w-0">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Pré-visualização"
                className="w-10 h-10 object-cover rounded border border-orange-200 shrink-0"
              />
            ) : selectedFile.type === 'application/pdf' ? (
              <div className="w-10 h-10 rounded bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded bg-orange-100 text-[#DF5830] flex items-center justify-center shrink-0">
                <ImageIcon className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-900 truncate">{selectedFile.name}</p>
              <p className="text-[10px] text-stone-500">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Novo anexo pronto para salvar
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-stone-400 hover:text-stone-700 hover:bg-stone-100 shrink-0"
            disabled={disabled}
            onClick={handleClearSelected}
            title="Remover anexo selecionado"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : existingFileUrl && !isRemovingCurrent ? (
        // Exibição de arquivo já salvo existente
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-stone-200 bg-stone-50/70">
          <div className="flex items-center gap-2.5 min-w-0">
            {isExistingImage ? (
              <img
                src={existingFileUrl}
                alt="Arquivo salvo"
                className="w-10 h-10 object-cover rounded border border-stone-200 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-900 truncate">
                {currentFileName || 'Arquivo anexado'}
              </p>
              <a
                href={existingFileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-[#DF5830] hover:underline flex items-center gap-1 font-medium"
              >
                <span>Ver / Baixar comprovante</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px] px-2 text-stone-600"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              Trocar
            </Button>
            {onRemoveCurrent && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-stone-400 hover:text-red-600"
                disabled={disabled}
                onClick={onRemoveCurrent}
                title="Remover anexo existente"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      ) : (
        // Opções para escolher arquivo ou tirar foto
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => cameraInputRef.current?.click()}
              className="h-10 text-xs border-stone-200 hover:border-orange-300 hover:bg-orange-50/40 text-stone-700 flex items-center justify-center gap-1.5"
            >
              <Camera className="w-4 h-4 text-[#DF5830]" />
              <span>Tirar foto</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className="h-10 text-xs border-stone-200 hover:border-orange-300 hover:bg-orange-50/40 text-stone-700 flex items-center justify-center gap-1.5"
            >
              <Upload className="w-4 h-4 text-[#DF5830]" />
              <span>Escolher arquivo</span>
            </Button>
          </div>
          {helperText && <p className="text-[11px] text-stone-500">{helperText}</p>}
        </div>
      )}
    </div>
  )
}

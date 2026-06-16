'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, RefreshCcw, Trash2, UploadCloud } from 'lucide-react';

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileNameFromUrl(url: string) {
  try {
    const parsed = new URL(url, 'http://local');
    const pathname = parsed.pathname.split('/').filter(Boolean);
    return pathname[pathname.length - 1] || url;
  } catch {
    return url.split('/').filter(Boolean).pop() || url;
  }
}

interface MediaUploadCardProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  accept: string;
  acceptedFormatsLabel: string;
  maxSizeLabel: string;
  isUploading?: boolean;
  uploadProgress?: number;
  error?: string | null;
  previewVariant?: 'wide' | 'square';
  helperText?: string;
}

export default function MediaUploadCard({
  label,
  value,
  onValueChange,
  selectedFile,
  onFileSelect,
  accept,
  acceptedFormatsLabel,
  maxSizeLabel,
  isUploading = false,
  uploadProgress = 0,
  error,
  previewVariant = 'wide',
  helperText,
}: MediaUploadCardProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setLocalPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setLocalPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  const previewUrl = localPreviewUrl || value || '';
  const previewShapeClass = previewVariant === 'square'
    ? 'aspect-square max-w-[8rem]'
    : 'aspect-[16/7]';
  const hasPreview = !!previewUrl;
  const currentFileName = selectedFile ? selectedFile.name : (value ? getFileNameFromUrl(value) : '');
  const currentFileSize = selectedFile ? formatBytes(selectedFile.size) : '';
  const zoneTitle = selectedFile ? 'Replace file' : 'Drag and drop or click to browse';
  const removeLabel = selectedFile && value
    ? 'Discard Selection'
    : selectedFile
      ? 'Remove Selected File'
      : 'Remove';

  const handleOpenPicker = () => inputRef.current?.click();

  const handleFileChange = (fileList: FileList | null) => {
    const file = fileList?.[0] || null;
    onFileSelect(file);
  };

  const infoRows = useMemo(() => {
    const rows = [
      `Accepted: ${acceptedFormatsLabel}`,
      `Max size: ${maxSizeLabel}`,
    ];
    if (helperText) rows.push(helperText);
    return rows;
  }, [acceptedFormatsLabel, helperText, maxSizeLabel]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-600 text-foreground">{label}</h3>
          <div className="mt-1 space-y-1">
            {infoRows.map((row) => (
              <p key={row} className="text-xs text-muted-foreground">{row}</p>
            ))}
          </div>
        </div>
        {selectedFile && (
          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-600 text-accent">
            Pending save
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className={`overflow-hidden rounded-2xl border border-dashed border-border bg-muted/20 ${previewShapeClass} w-full sm:w-44`}>
          {hasPreview ? (
            <img
              src={previewUrl}
              alt={`${label} preview`}
              className="h-full w-full object-contain bg-card"
            />
          ) : (
            <div className="flex h-full min-h-[8rem] w-full items-center justify-center text-muted-foreground">
              <ImagePlus size={28} />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3">
          <div
            role="button"
            tabIndex={0}
            aria-label={`${zoneTitle} for ${label}`}
            onClick={handleOpenPicker}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleOpenPicker();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragActive(false);
              handleFileChange(event.dataTransfer.files);
            }}
            className={`rounded-2xl border border-dashed p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
              isDragActive ? 'border-accent bg-accent/5' : 'border-border bg-muted/20 hover:border-accent/40'
            }`}
          >
            <input
              id={inputId}
              ref={inputRef}
              type="file"
              accept={accept}
              className="sr-only"
              onChange={(event) => handleFileChange(event.target.files)}
            />
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-accent/10 p-2 text-accent">
                <UploadCloud size={18} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-600 text-foreground">{zoneTitle}</p>
                <p className="text-xs text-muted-foreground">
                  Drag a file here, or activate this area to browse from your device.
                </p>
              </div>
            </div>
          </div>

          {(currentFileName || value) && (
            <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
              <p className="font-600 text-foreground">
                {selectedFile ? 'Selected file' : 'Current file'}
              </p>
              {currentFileName && <p className="mt-1 text-muted-foreground break-all">{currentFileName}</p>}
              {currentFileSize && <p className="text-xs text-muted-foreground mt-1">{currentFileSize}</p>}
            </div>
          )}

          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Loader2 size={14} className="animate-spin" />
                Uploading...
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-accent transition-[width] duration-200"
                  style={{ width: `${Math.max(8, uploadProgress)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{Math.round(uploadProgress)}%</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-negative">{error}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleOpenPicker}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-600 text-foreground hover:border-accent/40"
            >
              <RefreshCcw size={14} />
              {selectedFile || value ? 'Replace' : 'Browse'}
            </button>
            {(selectedFile || value) && (
              <button
                type="button"
                onClick={() => {
                  if (selectedFile && value) {
                    onFileSelect(null);
                  } else if (selectedFile) {
                    onFileSelect(null);
                    onValueChange('');
                  } else {
                    onValueChange('');
                  }
                  if (inputRef.current) inputRef.current.value = '';
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-600 text-muted-foreground hover:text-negative hover:border-negative/40"
              >
                <Trash2 size={14} />
                {removeLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

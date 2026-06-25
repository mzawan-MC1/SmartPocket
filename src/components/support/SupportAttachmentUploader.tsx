import React from 'react';
import { FileText, ImageIcon, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isSupportedUploadFile } from '@/lib/media-upload';
import {
  SUPPORT_ATTACHMENT_ALLOWED_EXTENSIONS,
  SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES,
  SUPPORT_ATTACHMENT_MAX_FILES,
  SUPPORT_ATTACHMENT_MAX_SIZE_BYTES,
} from '@/lib/support';

export type PendingSupportFile = {
  id: string;
  file: File;
  previewUrl: string | null;
};

interface SupportAttachmentUploaderProps {
  files: PendingSupportFile[];
  onChange: (files: PendingSupportFile[]) => void;
  uploadProgress?: Record<string, number>;
  disabled?: boolean;
  label?: string;
  namespace?: 'portal' | 'admin';
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

export default function SupportAttachmentUploader({
  files,
  onChange,
  uploadProgress = {},
  disabled = false,
  label,
  namespace = 'portal',
}: SupportAttachmentUploaderProps) {
  const { t } = useTranslation(namespace);
  const [error, setError] = React.useState<string | null>(null);
  const effectiveLabel = label || t('support.attachmentUploader.label');

  React.useEffect(() => {
    return () => {
      files.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, [files]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = Array.from(event.target.files || []);
    if (selected.length === 0) return;

    if (files.length + selected.length > SUPPORT_ATTACHMENT_MAX_FILES) {
      setError(`You can attach up to ${SUPPORT_ATTACHMENT_MAX_FILES} files per message.`);
      event.target.value = '';
      return;
    }

    try {
      const nextFiles = selected.map((file) => {
        isSupportedUploadFile({
          file,
          allowedMimeTypes: [...SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES],
          allowedExtensions: [...SUPPORT_ATTACHMENT_ALLOWED_EXTENSIONS],
          maxSizeBytes: SUPPORT_ATTACHMENT_MAX_SIZE_BYTES,
        });

        const isImage = file.type.startsWith('image/');
        return {
          id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
          file,
          previewUrl: isImage ? URL.createObjectURL(file) : null,
        };
      });

      onChange([...files, ...nextFiles]);
      event.target.value = '';
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Failed to attach file.');
      event.target.value = '';
    }
  };

  const removeFile = (id: string) => {
    const target = files.find((item) => item.id === id);
    if (target?.previewUrl) {
      URL.revokeObjectURL(target.previewUrl);
    }
    onChange(files.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-700 text-foreground">{effectiveLabel}</p>
          <p className="text-xs text-muted-foreground">{t('support.attachmentUploader.helper')}</p>
        </div>
        <label className={`btn-secondary cursor-pointer ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
          <Paperclip size={14} />
          {t('support.attachmentUploader.addFiles')}
          <input
            type="file"
            className="hidden"
            accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
            multiple
            onChange={handleFileChange}
            disabled={disabled}
          />
        </label>
      </div>

      {error ? (
        <div className="rounded-2xl border border-negative/20 bg-negative-soft px-3 py-2 text-sm text-negative">
          {error}
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {files.map((item) => {
            const progress = uploadProgress[item.id];
            const isPdf = item.file.type === 'application/pdf';
            return (
              <div key={item.id} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-muted">
                    {item.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                    ) : isPdf ? (
                      <FileText size={18} className="text-accent" />
                    ) : (
                      <ImageIcon size={18} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-600 text-foreground">{item.file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatSize(item.file.size)}</p>
                    {typeof progress === 'number' ? (
                      <div className="mt-2">
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {progress < 100 ? (
                            <span className="inline-flex items-center gap-1">
                              <Loader2 size={11} className="animate-spin" />
                              {t('support.attachmentUploader.uploading', { progress })}
                            </span>
                          ) : (
                            t('support.attachmentUploader.ready')
                          )}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="btn-ghost h-8 w-8 rounded-full p-0"
                    onClick={() => removeFile(item.id)}
                    disabled={disabled}
                    aria-label={t('support.attachmentUploader.removeFile', { name: item.file.name })}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
          <p className="text-sm font-600 text-foreground">{t('support.attachmentUploader.emptyTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('support.attachmentUploader.emptyDescription')}</p>
        </div>
      )}
    </div>
  );
}

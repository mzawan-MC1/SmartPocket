'use client';

import {
  TRANSACTION_DOCUMENT_MAX_SIZE_BYTES,
  classifyTransactionDocumentError,
  sanitizeTransactionDocumentFilename,
  validateTransactionDocumentFile,
  type TransactionDocumentErrorCode,
} from '@/lib/transaction-documents';

const TRANSACTION_DOCUMENT_OPTIMIZED_TARGET_BYTES = 4 * 1024 * 1024;
const TRANSACTION_DOCUMENT_OPTIMIZED_LONG_EDGE = 3200;
const TRANSACTION_DOCUMENT_OPTIMIZED_TALL_RECEIPT_LONG_EDGE = 4200;
const TRANSACTION_DOCUMENT_OPTIMIZED_TALL_RECEIPT_MIN_WIDTH = 1100;
const TRANSACTION_DOCUMENT_OPTIMIZED_JPEG_QUALITY = 0.94;

export type PreparedTransactionDocumentUpload =
  | {
      ok: true;
      file: File;
      originalFile: File;
      optimized: boolean;
    }
  | {
      ok: false;
      errorCode: TransactionDocumentErrorCode;
      errorMessage: string;
    };

function renameWithExtension(fileName: string, nextExtension: string) {
  const sanitized = sanitizeTransactionDocumentFilename(fileName);
  const dotIndex = sanitized.lastIndexOf('.');
  const baseName = dotIndex >= 0 ? sanitized.slice(0, dotIndex) : sanitized;
  return `${baseName || 'document'}${nextExtension}`;
}

function isOptimizableImage(file: File) {
  return file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp';
}

async function loadImageElement(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('This file appears to be empty or unreadable.'));
      element.src = objectUrl;
    });

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadImageSource(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall back to HTML image decoding below.
    }
  }

  const image = await loadImageElement(file);
  return {
    source: image,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    cleanup: () => undefined,
  };
}

async function optimizeImageForUpload(file: File) {
  const loaded = await loadImageSource(file);
  const originalWidth = loaded.width;
  const originalHeight = loaded.height;

  if (originalWidth <= 0 || originalHeight <= 0) {
    loaded.cleanup();
    throw new Error('This file appears to be empty or unreadable.');
  }

  const aspectRatio = Math.max(originalWidth, originalHeight) / Math.max(1, Math.min(originalWidth, originalHeight));
  const isTallReceipt = originalHeight > originalWidth && aspectRatio >= 2.4;
  const targetLongEdge = isTallReceipt
    ? TRANSACTION_DOCUMENT_OPTIMIZED_TALL_RECEIPT_LONG_EDGE
    : TRANSACTION_DOCUMENT_OPTIMIZED_LONG_EDGE;
  const longestEdge = Math.max(originalWidth, originalHeight);
  const scaledByLongEdge = longestEdge > targetLongEdge
    ? targetLongEdge / longestEdge
    : 1;
  const widthFloorScale = isTallReceipt && originalWidth > TRANSACTION_DOCUMENT_OPTIMIZED_TALL_RECEIPT_MIN_WIDTH
    ? TRANSACTION_DOCUMENT_OPTIMIZED_TALL_RECEIPT_MIN_WIDTH / originalWidth
    : 0;
  const scale = Math.min(1, Math.max(scaledByLongEdge, widthFloorScale));

  const targetWidth = Math.max(1, Math.round(originalWidth * scale));
  const targetHeight = Math.max(1, Math.round(originalHeight * scale));
  const shouldAttemptOptimization = scale < 1
    || file.size > TRANSACTION_DOCUMENT_OPTIMIZED_TARGET_BYTES
    || file.type === 'image/png';

  if (!shouldAttemptOptimization) {
    loaded.cleanup();
    return {
      file,
      optimized: false,
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    loaded.cleanup();
    return {
      file,
      optimized: false,
    };
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(loaded.source, 0, 0, targetWidth, targetHeight);
  loaded.cleanup();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', TRANSACTION_DOCUMENT_OPTIMIZED_JPEG_QUALITY);
  });

  if (!blob || blob.size <= 0) {
    return {
      file,
      optimized: false,
    };
  }

  if (blob.size >= file.size && scale === 1) {
    return {
      file,
      optimized: false,
    };
  }

  const optimizedFile = new File([blob], renameWithExtension(file.name, '.jpg'), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });

  if (optimizedFile.size > TRANSACTION_DOCUMENT_MAX_SIZE_BYTES) {
    return {
      file,
      optimized: false,
    };
  }

  return {
    file: optimizedFile,
    optimized: optimizedFile.name !== file.name || optimizedFile.size !== file.size,
  };
}

export async function prepareTransactionDocumentUpload(
  file: File
): Promise<PreparedTransactionDocumentUpload> {
  try {
    await validateTransactionDocumentFile(file);
  } catch (error) {
    const errorCode = classifyTransactionDocumentError(error) || 'invalid_type';
    return {
      ok: false,
      errorCode,
      errorMessage: error instanceof Error ? error.message : 'Only JPG, JPEG, PNG, and PDF files are supported.',
    };
  }

  if (!isOptimizableImage(file)) {
    return {
      ok: true,
      file,
      originalFile: file,
      optimized: false,
    };
  }

  try {
    const optimized = await optimizeImageForUpload(file);
    return {
      ok: true,
      file: optimized.file,
      originalFile: file,
      optimized: optimized.optimized,
    };
  } catch (error) {
    const errorCode = classifyTransactionDocumentError(error) || 'empty_file';
    return {
      ok: false,
      errorCode,
      errorMessage: error instanceof Error ? error.message : 'This file appears to be empty or unreadable.',
    };
  }
}

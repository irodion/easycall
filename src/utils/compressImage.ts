const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.8;

export async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const { width, height } = img;
      let newWidth = width;
      let newHeight = height;

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          newWidth = MAX_DIMENSION;
          newHeight = Math.round((height / width) * MAX_DIMENSION);
        } else {
          newHeight = MAX_DIMENSION;
          newWidth = Math.round((width / height) * MAX_DIMENSION);
        }
      }

      const canvas = document.createElement('canvas');
      (canvas as unknown as { width: number; height: number }).width = newWidth;
      (canvas as unknown as { width: number; height: number }).height = newHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context not available'));
        return;
      }

      ctx.drawImage(img, 0, 0, newWidth, newHeight);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to compress image'));
        },
        'image/jpeg',
        JPEG_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    img.src = objectUrl;
  });
}

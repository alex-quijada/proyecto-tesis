/**
 * Utilidad de compresión y redimensionamiento de imágenes en el cliente (navegador/WebView).
 *
 * Reduce fotos de alta resolución (4K/12MP de 4-8 MB) a dimensiones óptimas (máx 1280px)
 * y comprime a formato JPEG con calidad optimizada (~120-200 KB), ahorrando más del 95%
 * de ancho de banda móvil y acelerando la subida a Supabase Storage.
 */
export async function comprimirDataUrl(
    dataUrl: string,
    maxWidth = 1280,
    maxHeight = 1280,
    calidad = 0.72,
): Promise<string> {
    return new Promise((resolve) => {
        if (!dataUrl || !dataUrl.startsWith('data:image')) {
            resolve(dataUrl);
            return;
        }

        const img = new Image();
        img.onload = () => {
            let { width, height } = img;

            // Si la imagen excede el tamaño máximo, escalar proporcionalmente
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(dataUrl);
                return;
            }

            // Fondo blanco en caso de transparencias antes de pasar a JPEG
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);

            ctx.drawImage(img, 0, 0, width, height);

            try {
                const compressedDataUrl = canvas.toDataURL('image/jpeg', calidad);
                resolve(compressedDataUrl);
            } catch {
                resolve(dataUrl);
            }
        };

        img.onerror = () => {
            resolve(dataUrl);
        };

        img.src = dataUrl;
    });
}

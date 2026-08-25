/** Convierte un texto a formato título: primera letra de cada palabra en
 *  mayúscula y el resto en minúsculas. Ej: "JUNIOR LOPEZ" → "Junior Lopez". */
export function capitalizar(v: string | null | undefined): string {
    if (!v) return v || '';
    return v
        .toLowerCase()
        .split(' ')
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
        .join(' ');
}

/** Convierte un texto a MAYÚSCULAS (para placas, marcas y modelos). */
export function aMayusculas(v: string | null | undefined): string {
    return (v || '').toUpperCase();
}

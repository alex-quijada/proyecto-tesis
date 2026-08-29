import { Pipe, PipeTransform } from '@angular/core';

/** Código de incidencia (BD) → etiqueta legible para el usuario. */
const MAPA_TIPOS: Record<string, string> = {
    FUERA_HORARIO: 'Cliente fuera de tiempo',
    CERRADO: 'Cliente cerrado',
    FALTANTE: 'Producto faltante',
    SOBRANTE: 'Producto sobrante',
    NO_SOLICITADO: 'Producto no solicitado',
    DANADO: 'Producto dañado',
};

@Pipe({ name: 'tipoIncidencia', standalone: true })
export class TipoIncidenciaPipe implements PipeTransform {
    transform(codigo?: string | null): string {
        if (!codigo) return '';
        const norm = codigo.toUpperCase().trim();
        return MAPA_TIPOS[norm] || codigo;
    }
}

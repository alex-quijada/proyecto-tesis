/** Filtros comunes a todos los reportes. */
export interface FiltrosReporte {
    fechaDesde?: string | null;
    fechaHasta?: string | null;
    idChofer?: string | null;
    idMunicipio?: string | null;
    idVehiculo?: string | null;
    idEmpresa?: string | null;
    estado?: string | null;
}

/** Opción genérica para selectores (chofer, municipio, vehículo, empresa…). */
export interface OpcionFiltro {
    label: string;
    value: string;
}

/** Columna exportable de un reporte. */
export interface ColumnaExport {
    key: string;
    label: string;
}

/** Fila exportable: valores por `key` de columna. */
export type FilaExport = Record<string, string | number | boolean | null | undefined>;

/** Resultado de exportación (datos filtrados actuales). */
export interface DatosExport {
    titulo: string;
    subtitulo?: string;
    columnas: ColumnaExport[];
    filas: FilaExport[];
    nombreArchivo: string;
    /** Orientación de página para PDF (default 'portrait'). */
    pageOrientation?: 'portrait' | 'landscape';
    /** Anchos relativos por columna para el PDF (opcional). Ej: [6, 5, 12, 8, 10, 6, 8, 6, 6, 6]. */
    columnWidths?: number[];
}

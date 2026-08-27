import { DatosExport } from './reporte.types';

const EXCEL_COL_WIDTH = 16;

/**
 * Exporta datos a un archivo .xlsx real (SheetJS cargado dinámicamente bajo demanda).
 * Las filas se serializan usando el `label` de cada columna como encabezado.
 */
export async function exportarExcel(datos: DatosExport): Promise<void> {
    const XLSX = await import('xlsx');
    const { titulo, subtitulo, columnas, filas, nombreArchivo } = datos;

    const data = filas.map((fila) => {
        const out: Record<string, unknown> = {};
        for (const col of columnas) {
            out[col.label] = fila[col.key] ?? '';
        }
        return out;
    });

    const hoja = XLSX.utils.json_to_sheet(data);
    hoja['!cols'] = columnas.map(() => ({ wch: EXCEL_COL_WIDTH }));

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Reporte');

    // Segunda hoja con metadatos del reporte (título, rango).
    const meta = [
        ['Reporte', titulo],
        ['Generado', new Date().toLocaleString('es-VE')],
    ];
    if (subtitulo) meta.push(['Detalle', subtitulo]);
    const hojaMeta = XLSX.utils.aoa_to_sheet(meta);
    hojaMeta['!cols'] = [{ wch: 16 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(libro, hojaMeta, 'Información');

    XLSX.writeFile(libro, `${nombreArchivo}.xlsx`);
}

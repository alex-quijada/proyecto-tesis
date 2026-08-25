import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { DatosExport } from './reporte.types';

pdfMake.addVirtualFileSystem(pdfFonts);

/**
 * Exporta datos a un archivo .pdf (pdfmake) con una tabla simple.
 * No depende de tipos oficiales (pdfmake 0.3.x no trae .d.ts): se usa la
 * declaración local en `src/types/pdfmake.d.ts`.
 */
export function exportarPdf(datos: DatosExport): void {
    const { titulo, subtitulo, columnas, filas, nombreArchivo, pageOrientation, columnWidths } =
        datos;
    const landscape = pageOrientation === 'landscape';

    const body: unknown[][] = [
        columnas.map((c) => ({
            text: c.label,
            style: 'header',
        })),
        ...filas.map((fila) =>
            columnas.map((c) => ({
                text: String(fila[c.key] ?? ''),
                fontSize: 7.5,
            })),
        ),
    ];

    const doc = {
        pageSize: 'LETTER' as const,
        pageOrientation: pageOrientation || ('portrait' as const),
        pageMargins: landscape ? [24, 28, 24, 28] : [36, 32, 36, 32],
        content: [
            { text: titulo, style: 'titulo' },
            ...(subtitulo
                ? [{ text: subtitulo, style: 'subtitulo', margin: [0, 2, 0, 8] as number[] }]
                : [
                      {
                          text: new Date().toLocaleString('es-VE'),
                          style: 'subtitulo',
                          margin: [0, 2, 0, 8] as number[],
                      },
                  ]),
            {
                layout: 'lightHorizontalLines',
                table: {
                    headerRows: 1,
                    widths: columnWidths?.length ? columnWidths : columnas.map(() => '*'),
                    body,
                },
            },
        ],
        styles: {
            titulo: { fontSize: 16, bold: true, margin: [0, 0, 0, 3] as number[] },
            subtitulo: { fontSize: 9, color: '#64748b' },
            header: {
                bold: true,
                fontSize: 8,
                fillColor: '#e2e8f0',
                margin: [2, 2, 2, 2] as number[],
            },
        },
        defaultStyle: { fontSize: 8 },
    };

    pdfMake.createPdf(doc).download(`${nombreArchivo}.pdf`);
}

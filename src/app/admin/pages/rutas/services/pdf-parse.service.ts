import { Injectable } from '@angular/core';
import { DatosGuia, FacturaAsociada } from '../models/pdf-data.model';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

@Injectable({
    providedIn: 'root',
})
export class PdfNormalizerService {
    async procesarArchivoPdf(file: File): Promise<DatosGuia> {
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const paginas: string[] = [];
        const ultima = pdf.numPages > 1 ? pdf.numPages - 1 : pdf.numPages;
        for (let i = 1; i <= ultima; i++) {
            const page = await pdf.getPage(i);
            paginas.push((await page.getTextContent()).items.map((i: any) => i.str).join(' '));
        }
        return this.normalizarDocumento(paginas);
    }

    normalizarDocumento(paginas: string[]): DatosGuia {
        const texto = paginas.join(' ');
        const { camion, placa, pesoLimite } = this.parsearVehiculo(texto);
        const chofer = this.parsearChofer(texto);
        const facturas = this.parsearFacturas(texto);
        const totales = this.parsearTotales(texto);

        return { camion, placa, pesoLimite, chofer, ruta: this.parsearRuta(texto), facturas, ...totales };
    }

    private parsearVehiculo(texto: string): { camion: string; placa: string; pesoLimite: number } {
        const m = texto.match(/\[([A-Z0-9]+)\]\s*(.+?)\s*-\s*(\d+[\.,]?\d*)\s*kg/i);
        if (m) return {
            camion: `[${m[1].toUpperCase()}] ${m[2].trim()}`,
            placa: m[1].toUpperCase(),
            pesoLimite: parseFloat(m[3].replace(',', '.')),
        };
        return { camion: '', placa: '', pesoLimite: 0 };
    }

    private parsearChofer(texto: string): string {
        const m = texto.match(/\[(\d+)\]\s+([A-ZÁÉÍÓÚÑ]+)\s+([A-ZÁÉÍÓÚÑ]+)(?=\s|$)/i);
        if (m) return `[${m[1]}] ${m[2]} ${m[3]}`;
        return '';
    }

    private parsearRuta(texto: string): string {
        const m = texto.match(/\[\d+\]\s+[A-ZÁÉÍÓÚÑ]+\s+[A-ZÁÉÍÓÚÑ]+\s+([A-ZÁÉÍÓÚÑ]+)\b/i);
        return m ? m[1] : '';
    }

    private parsearFacturas(texto: string): FacturaAsociada[] {
        const idx = texto.search(/facturas\s+asociadas/i);
        if (idx === -1) return [];

        const seccion = texto.slice(idx);

        const nums: { num: string; idx: number }[] = [];
        const re = /\b(\d{6})\b/g;
        let m;
        while ((m = re.exec(seccion)) !== null) {
            if (nums.length === 0 || m[1] !== nums[nums.length - 1].num) {
                nums.push({ num: m[1], idx: m.index });
            }
        }

        const addrKeywords = /\b(CALLE|AV|AVENIDA|URB|URBANIZACION|SECTOR|EDIF|EDIFICIO|VIA|CARRETERA|CARRERA|TRANSVERSAL|PISO|PB)\b/i;

        const finTotal = seccion.search(/\bTotal\s*:\s*\d/);
        const tope = finTotal !== -1 ? finTotal : seccion.length;

        const facturas: FacturaAsociada[] = [];
        for (let i = 0; i < nums.length; i++) {
            const inicio = nums[i].idx;
            const fin = i + 1 < nums.length ? Math.min(nums[i + 1].idx, tope) : tope;
            const bloque = seccion.slice(inicio, fin);

            const amtRe = /(\d{1,3}(?:,\d{2})?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\b/;
            const amtMatch = bloque.match(amtRe);
            let totalUSD = 0, totalVES = 0;
            let cuerpo = bloque;
            let extra = '';
            if (amtMatch) {
                totalUSD = parseFloat(amtMatch[1].replace(',', '.'));
                totalVES = parseFloat(amtMatch[2].replace(/\./g, '').replace(',', '.'));
                const amtEnd = amtMatch.index! + amtMatch[0].length;
                cuerpo = bloque.slice(0, amtMatch.index).trim();
                extra = bloque.slice(amtEnd).trim();
            }

            cuerpo = cuerpo.replace(new RegExp(`\\s*${nums[i].num}\\s*`), ' ').trim();
            cuerpo = cuerpo.replace(/\s+/g, ' ').trim();

            let cliente = cuerpo;
            let tlf = 'N/A';
            let direccion = 'NO ESPECIFICADA';

            const tlfMatch = cuerpo.match(/\+58[\s-]*\d{3}[\s-]*\d{7}/);
            if (tlfMatch) {
                tlf = tlfMatch[0];
                cliente = cuerpo.slice(0, tlfMatch.index).replace(/[,\s]+$/, '').trim();
                const addrBody = cuerpo.slice(tlfMatch.index! + tlfMatch[0].length).trim();
                direccion = addrBody || direccion;
            } else {
                const addrKMatch = cuerpo.match(addrKeywords);
                if (addrKMatch && addrKMatch.index! > 0) {
                    cliente = cuerpo.slice(0, addrKMatch.index).replace(/[,\s]+$/, '').trim();
                    direccion = cuerpo.slice(addrKMatch.index).trim();
                }
            }

            if (extra) {
                direccion = direccion === 'NO ESPECIFICADA' ? extra : `${direccion}, ${extra}`;
            }

            cliente = cliente.replace(/,?\s*C\.A\.?$/i, '').trim();
            cliente = cliente.replace(/\s+/g, ' ').trim();
            if (!cliente) cliente = 'CLIENTE DESCONOCIDO';

            facturas.push({
                numero: nums[i].num,
                cliente,
                tlf,
                direccion,
                totalUSD,
                totalVES,
            });
        }
        return facturas;
    }

    private parsearTotales(texto: string): { totalDolares: number; totalBolivares: number } {
        const m = texto.match(/total:?\s*([\d.,]+)\s*([\d.,]+)/i);
        if (m) return {
            totalDolares: parseFloat(m[1].replace(',', '.')),
            totalBolivares: parseFloat(m[2].replace(/\./g, '').replace(',', '.')),
        };
        return { totalDolares: 0, totalBolivares: 0 };
    }
}

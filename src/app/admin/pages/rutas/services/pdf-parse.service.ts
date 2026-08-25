import { Injectable } from '@angular/core';
import { DatosGuia, Empresa, FacturaAsociada } from '../models/pdf-data.model';

@Injectable({
    providedIn: 'root',
})
export class PdfNormalizerService {
    async procesarArchivoPdf(file: File): Promise<DatosGuia> {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url,
        ).toString();

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
        const { empresa, codigoGuia } = this.parsearEncabezado(texto);
        const { camion, placa, pesoLimite } = this.parsearVehiculo(texto);
        const chofer = this.parsearChofer(texto);
        const facturas = this.parsearFacturas(texto, codigoGuia);
        const totales = this.parsearTotales(texto);

        return {
            empresa,
            codigoGuia,
            camion,
            placa,
            pesoLimite,
            chofer,
            ruta: this.parsearRuta(texto),
            facturas,
            ...totales,
        };
    }

    private parsearVehiculo(texto: string): { camion: string; placa: string; pesoLimite: number } {
        const m = texto.match(/\[([A-Z0-9]+)\]\s*(.+?)\s*-\s*(\d+[\.,]?\d*)\s*kg/i);
        if (m)
            return {
                camion: `[${m[1].toUpperCase()}] ${m[2].trim()}`,
                placa: m[1].toUpperCase(),
                pesoLimite: parseFloat(m[3].replace(',', '.')),
            };
        return { camion: '', placa: '', pesoLimite: 0 };
    }

    private parsearChofer(texto: string): string {
        const m = texto.match(/\[(\d+)\]\s+([A-ZÁÉÍÓÚÑ]+)\s+([A-ZÁÉÍÓÚÑ]+)(?=\s|$)/i);
        if (m) return `[${m[1]}] ${m[2]} ${m[3]}`;
        const m2 = texto.match(/\[-\]\s+([A-ZÁÉÍÓÚÑ]+)\s+([A-ZÁÉÍÓÚÑ]+)(?=\s|$)/i);
        if (m2) return `${m2[1]} ${m2[2]}`;
        return '';
    }

    private parsearRuta(texto: string): string {
        const m = texto.match(/\[\d+\]\s+[A-ZÁÉÍÓÚÑ]+\s+[A-ZÁÉÍÓÚÑ]+\s+([A-ZÁÉÍÓÚÑ]+)\b/i);
        if (m) return m[1];
        const m2 = texto.match(/\[-\]\s+[A-ZÁÉÍÓÚÑ]+\s+[A-ZÁÉÍÓÚÑ]+\s+([A-ZÁÉÍÓÚÑ]+)\b/i);
        return m2 ? m2[1] : '';
    }

    /**
     * Detecta el formato del número de factura según el código de guía.
     * - batch/out/<solo número>  → factura de 6 dígitos (PDF 1)
     * - batch/out/<letras>/...   → factura de 8 dígitos con ceros al inicio (PDF 2)
     * Se usa como preferencia; si no da resultados, se prueba heurísticamente.
     */
    private detectarDigitosFactura(codigoGuia: string): 5 | 6 | 7 | 8 {
        if (/batch\/out\/[a-z]+\//.test(codigoGuia)) return 8;
        return 6;
    }

    /**
     * Prueba cada longitud candidata de número de factura sobre la sección y
     * devuelve la mejor según coherencia (más bloques completos con montos).
     */
    private mejorLongitudFactura(seccion: string): 5 | 6 | 7 | 8 {
        const longitudes: (5 | 6 | 7 | 8)[] = [8, 6, 5, 7];
        let mejor: 5 | 6 | 7 | 8 = 6;
        let mejorScore = -1;
        for (const digitos of longitudes) {
            const nums = this.extraerNumeros(seccion, digitos);
            if (nums.length === 0) continue;
            let conMonto = 0;
            const amtRe = /(\d{1,3}(?:,\d{2})?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\b/;
            for (let i = 0; i < nums.length; i++) {
                const inicio = nums[i].idx;
                const fin = i + 1 < nums.length ? nums[i + 1].idx : seccion.length;
                if (amtRe.test(seccion.slice(inicio, fin))) conMonto++;
            }
            const score = nums.length * 2 + conMonto;
            if (score > mejorScore) {
                mejorScore = score;
                mejor = digitos;
            }
        }
        return mejor;
    }

    private extraerNumeros(seccion: string, digitos: number): { num: string; idx: number }[] {
        const nums: { num: string; idx: number }[] = [];
        // El número de factura puede llevar un prefijo de letras opcional
        // (p. ej. "A050160" = A + 6 dígitos) o ser solo dígitos. Los lookarounds
        // evitan capturar números dentro de montos/fechas/otros códigos.
        const re = new RegExp(`(?<![A-Z0-9])[A-Z]{0,3}\\d{${digitos}}(?![0-9])`, 'g');
        let m;
        while ((m = re.exec(seccion)) !== null) {
            const num = m[0];
            if (nums.length === 0 || num !== nums[nums.length - 1].num) {
                nums.push({ num, idx: m.index });
            }
        }
        return nums;
    }

    private parsearFacturas(texto: string, codigoGuia: string): FacturaAsociada[] {
        const idx = texto.search(/facturas\s+asociadas/i);
        if (idx === -1) return [];

        const seccion = texto.slice(idx);

        const preferida = this.detectarDigitosFactura(codigoGuia);
        let digitos = preferida;
        if (this.extraerNumeros(seccion, preferida).length === 0) {
            digitos = this.mejorLongitudFactura(seccion);
        }

        const nums = this.extraerNumeros(seccion, digitos);

        const addrKeywords =
            /\b(CALLE|AV|AVENIDA|URB|URBANIZACION|SECTOR|EDIF|EDIFICIO|VIA|CARRETERA|CARRERA|TRANSVERSAL|PISO|PB)\b/i;

        const finTotal = seccion.search(/\bTotal\s*:\s*\d/);
        const tope = finTotal !== -1 ? finTotal : seccion.length;

        const facturas: FacturaAsociada[] = [];
        for (let i = 0; i < nums.length; i++) {
            const inicio = nums[i].idx;
            const fin = i + 1 < nums.length ? Math.min(nums[i + 1].idx, tope) : tope;
            const bloque = seccion.slice(inicio, fin);

            const amtRe = /(\d{1,3}(?:,\d{2})?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\b/;
            const amtMatch = bloque.match(amtRe);
            let totalUSD = 0,
                totalVES = 0;
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
            cuerpo = cuerpo.replace(new RegExp(`^[A-Z]{0,3}\\d{${digitos}}\\s*`), '').trim();

            let cliente = cuerpo;
            let tlf = 'N/A';
            let direccion = 'NO ESPECIFICADA';

            const tlfMatch = cuerpo.match(/\+58[\s-]*\d{3}[\s-]*\d{7}/);
            if (tlfMatch) {
                tlf = '0' + tlfMatch[0].replace(/^\+58[\s-]*/, '').replace(/[\s-]/g, '');
                cliente = cuerpo
                    .slice(0, tlfMatch.index)
                    .replace(/[,\s]+$/, '')
                    .trim();
                const addrBody = cuerpo.slice(tlfMatch.index! + tlfMatch[0].length).trim();
                direccion = addrBody || direccion;
            } else {
                const addrKMatch = cuerpo.match(addrKeywords);
                if (addrKMatch && addrKMatch.index! > 0) {
                    cliente = cuerpo
                        .slice(0, addrKMatch.index)
                        .replace(/[,\s]+$/, '')
                        .trim();
                    direccion = cuerpo.slice(addrKMatch.index).trim();
                }
            }

            if (extra) {
                direccion = direccion === 'NO ESPECIFICADA' ? extra : `${direccion}, ${extra}`;
            }

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
        if (m)
            return {
                totalDolares: parseFloat(m[1].replace(',', '.')),
                totalBolivares: parseFloat(m[2].replace(/\./g, '').replace(',', '.')),
            };
        return { totalDolares: 0, totalBolivares: 0 };
    }

    private parsearEncabezado(texto: string): { empresa: Empresa | ''; codigoGuia: string } {
        // BATCH/OUT/<n> | BATCH/OUT/<letras>/<n> | BATCH/OUT/<letras>/<letras>/<n> ... (siempre 5 dígitos al final)
        const reCodigo = /batch\/out\/(?:[a-z0-9]+\/)*\d{5}\b/i;
        const m = texto.match(/^(.+?)\s+(batch\/out\/(?:[a-z0-9]+\/)*\d{5})\b/i);
        if (m && !m[1].startsWith('CAMIÓN')) {
            return { empresa: m[1].trim() as Empresa, codigoGuia: m[2].toLowerCase() };
        }
        const m2 = texto.match(reCodigo);
        return { empresa: '', codigoGuia: m2 ? m2[0].toLowerCase() : '' };
    }
}

/** Palabras de tipo legal/razón social que se ignoran al comparar empresas. */
const PALABRAS_IGNORAR = new Set([
    'c.a.',
    'ca',
    's.r.l.',
    'srl',
    's.a.',
    'sa',
    's.a.c.',
    'sac',
    's.a.c.i.a.',
    's.a.c.f.i.a.',
    'e.c.',
    'sc',
    's.c.',
    'rl',
    'c.a',
    'c.',
    's.',
]);

/**
 * Normaliza un texto para comparación de nombres: minúsculas, sin acentos,
 * sin puntuación, palabras legales fuera, espacios simples.
 */
export function normalizarTexto(texto: string): string {
    return (texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w && !PALABRAS_IGNORAR.has(w))
        .join(' ');
}

/**
 * Similitud de Levenshtein normalizada (0..1). 1 = textos idénticos,
 * 0 = completamente distintos. Mejor para nombres que la comparación exacta.
 */
export function similitudTexto(a: string, b: string): number {
    const x = normalizarTexto(a);
    const y = normalizarTexto(b);
    if (!x.length || !y.length) return x === y ? 1 : 0;
    const d = levenshtein(x, y);
    return 1 - d / Math.max(x.length, y.length);
}

function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = new Array<number>(n + 1);
    let curr = new Array<number>(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[n];
}

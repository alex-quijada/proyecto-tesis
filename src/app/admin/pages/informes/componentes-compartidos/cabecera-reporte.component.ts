import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

@Component({
    selector: 'app-cabecera-reporte',
    standalone: true,
    imports: [CommonModule, ButtonModule, TooltipModule],
    template: `
        <div class="flex flex-wrap items-center gap-3 mb-4">
            <div class="flex-1 min-w-0">
                <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-0 truncate">
                    {{ titulo() }}
                </h1>
                @if (subtitulo()) {
                    <p class="text-sm text-muted-color mt-0.5">{{ subtitulo() }}</p>
                }
            </div>
            <div class="flex items-center gap-2">
                <p-button
                    icon="pi pi-refresh"
                    text
                    rounded
                    size="small"
                    severity="secondary"
                    [loading]="recargando()"
                    (onClick)="recargar.emit()"
                    pTooltip="Actualizar"
                    tooltipPosition="left"
                />
                <p-button
                    icon="pi pi-file-excel"
                    label="Excel"
                    severity="success"
                    size="small"
                    [loading]="exportandoExcel()"
                    [disabled]="sinDatos()"
                    (onClick)="exportarExcel.emit()"
                    pTooltip="Exportar a Excel (.xlsx)"
                    tooltipPosition="top"
                />
                <p-button
                    icon="pi pi-file-pdf"
                    label="PDF"
                    severity="danger"
                    size="small"
                    *ngIf="mostrarPdf()"
                    [loading]="exportandoPdf()"
                    [disabled]="sinDatos()"
                    (onClick)="exportarPdf.emit()"
                    pTooltip="Exportar a PDF"
                    tooltipPosition="top"
                />
            </div>
        </div>
    `,
})
export class CabeceraReporteComponent {
    titulo = input.required<string>();
    subtitulo = input<string>('');
    sinDatos = input<boolean>(false);
    recargando = input<boolean>(false);
    exportandoExcel = input<boolean>(false);
    exportandoPdf = input<boolean>(false);
    /** Si false, oculta el botón de exportar PDF (ej. Operaciones). */
    mostrarPdf = input<boolean>(true);

    recargar = output<void>();
    exportarExcel = output<void>();
    exportarPdf = output<void>();
}

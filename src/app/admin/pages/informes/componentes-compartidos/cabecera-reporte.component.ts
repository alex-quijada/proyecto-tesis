import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

@Component({
    selector: 'app-cabecera-reporte',
    standalone: true,
    imports: [CommonModule, ButtonModule, TooltipModule],
    templateUrl: './cabecera-reporte.component.html',
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

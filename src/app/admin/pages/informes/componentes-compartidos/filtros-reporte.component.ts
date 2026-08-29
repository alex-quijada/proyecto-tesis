import { Component, model, output, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { FiltrosReporte, OpcionFiltro } from '../utils/reporte.types';

@Component({
    selector: 'app-filtros-reporte',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, DatePickerModule, SelectModule],
    templateUrl: './filtros-reporte.component.html',
})
export class FiltrosReporteComponent {
    choferes = input<OpcionFiltro[]>([]);
    municipios = input<OpcionFiltro[]>([]);
    vehiculos = input<OpcionFiltro[]>([]);
    empresas = input<OpcionFiltro[]>([]);
    estados = input<OpcionFiltro[]>([]);

    /** Modelo de filtros compartido con el reporte. */
    filtros = model<FiltrosReporte>({});

    /** Notifica al reporte que debe recargar con los filtros actuales. */
    aplicar = output<void>();

    rangoFechas: (Date | null)[] | null = null;

    onRangoChange(rango: (Date | null)[] | null) {
        this.rangoFechas = rango;
        this.actualizar('fechaDesde', rango?.[0] ? this.toISO(rango[0]) : null);
        this.actualizar('fechaHasta', rango?.[1] ? this.toISO(rango[1]) : null);
    }

    private toISO(d: Date): string {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
            d.getDate(),
        ).padStart(2, '0')}`;
    }

    actualizar(clave: keyof FiltrosReporte, valor: string | null | undefined) {
        this.filtros.update((f) => ({ ...f, [clave]: valor || null }));
    }

    filtrosVacios(): boolean {
        const f = this.filtros();
        return (
            !f.fechaDesde &&
            !f.fechaHasta &&
            !f.idChofer &&
            !f.idMunicipio &&
            !f.idVehiculo &&
            !f.idEmpresa &&
            !f.estado
        );
    }

    limpiar() {
        this.filtros.set({});
        this.rangoFechas = null;
        this.aplicar.emit();
    }
}

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
    template: `
        <div
            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/40 p-4 mb-4"
        >
            <div class="flex flex-wrap items-end gap-3">
                <div class="flex flex-col gap-1">
                    <label class="text-xs font-semibold text-surface-500 uppercase"
                        >Rango de fechas</label
                    >
                    <p-datepicker
                        [style]="{ width: '15rem' }"
                        inputId="rango"
                        dateFormat="dd/mm/yy"
                        selectionMode="range"
                        [ngModel]="rangoFechas"
                        (ngModelChange)="onRangoChange($event)"
                        placeholder="Desde — Hasta"
                        appendTo="body"
                    />
                </div>

                @if (choferes().length) {
                    <div class="flex flex-col gap-1">
                        <label class="text-xs font-semibold text-surface-500 uppercase"
                            >Chofer</label
                        >
                        <p-select
                            [options]="choferes()"
                            optionLabel="label"
                            optionValue="value"
                            [ngModel]="filtros().idChofer"
                            (ngModelChange)="actualizar('idChofer', $event)"
                            placeholder="Todos"
                            [style]="{ width: '12rem' }"
                            [showClear]="true"
                            appendTo="body"
                        />
                    </div>
                }

                @if (municipios().length) {
                    <div class="flex flex-col gap-1">
                        <label class="text-xs font-semibold text-surface-500 uppercase"
                            >Municipio</label
                        >
                        <p-select
                            [options]="municipios()"
                            optionLabel="label"
                            optionValue="value"
                            [ngModel]="filtros().idMunicipio"
                            (ngModelChange)="actualizar('idMunicipio', $event)"
                            placeholder="Todos"
                            [style]="{ width: '11rem' }"
                            [showClear]="true"
                            appendTo="body"
                        />
                    </div>
                }

                @if (vehiculos().length) {
                    <div class="flex flex-col gap-1">
                        <label class="text-xs font-semibold text-surface-500 uppercase"
                            >Vehículo</label
                        >
                        <p-select
                            [options]="vehiculos()"
                            optionLabel="label"
                            optionValue="value"
                            [ngModel]="filtros().idVehiculo"
                            (ngModelChange)="actualizar('idVehiculo', $event)"
                            placeholder="Todos"
                            [style]="{ width: '11rem' }"
                            [showClear]="true"
                            appendTo="body"
                        />
                    </div>
                }

                @if (empresas().length) {
                    <div class="flex flex-col gap-1">
                        <label class="text-xs font-semibold text-surface-500 uppercase"
                            >Empresa</label
                        >
                        <p-select
                            [options]="empresas()"
                            optionLabel="label"
                            optionValue="value"
                            [ngModel]="filtros().idEmpresa"
                            (ngModelChange)="actualizar('idEmpresa', $event)"
                            placeholder="Todas"
                            [style]="{ width: '11rem' }"
                            [showClear]="true"
                            appendTo="body"
                        />
                    </div>
                }

                <div class="flex items-center gap-2">
                    <p-button
                        label="Aplicar"
                        icon="pi pi-filter"
                        size="small"
                        (onClick)="aplicar.emit()"
                    />
                    <p-button
                        label="Limpiar"
                        icon="pi pi-times"
                        size="small"
                        severity="secondary"
                        text
                        [disabled]="filtrosVacios()"
                        (onClick)="limpiar()"
                    />
                </div>
            </div>
        </div>
    `,
})
export class FiltrosReporteComponent {
    choferes = input<OpcionFiltro[]>([]);
    municipios = input<OpcionFiltro[]>([]);
    vehiculos = input<OpcionFiltro[]>([]);
    empresas = input<OpcionFiltro[]>([]);

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

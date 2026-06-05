import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { ChipModule } from 'primeng/chip';
import { DividerModule } from 'primeng/divider';
import { BadgeModule } from 'primeng/badge';
import { CardModule } from 'primeng/card';

import {
    CargaCombustible, COMBUSTIBLE_MOCK, VEHICULOS_TANQUE,
    NIVELES_TANQUE, METODOS_CALCULO, TIPOS_COMBUSTIBLE,
} from './data/combustible-mock';
import { CombustibleDialogComponent } from './components/combustible-dialog.component';

interface VehiculoConsolidado {
    id: string;
    placa: string;
    desc: string;
    capacidadTanque: number;
    totalCargas: number;
    totalLitros: number;
    totalGastado: number;
    ultimaCarga: CargaCombustible | null;
}

@Component({
    selector: 'app-combustible',
    standalone: true,
    imports: [
        CommonModule,
        TableModule,
        ButtonModule,
        TooltipModule,
        TagModule,
        ChipModule,
        DividerModule,
        BadgeModule,
        CardModule,
        CombustibleDialogComponent,
    ],
    templateUrl: './combustible.component.html',
})
export class CombustibleComponent {
    registros: CargaCombustible[] = [...COMBUSTIBLE_MOCK].sort((a, b) => b.fecha.localeCompare(a.fecha));
    dialogVisible = false;
    editingRecord: CargaCombustible = {} as CargaCombustible;

    niveles = NIVELES_TANQUE;
    metodos = METODOS_CALCULO;
    tipos = TIPOS_COMBUSTIBLE;

    get metodoLabels(): Record<string, string> {
        const map: Record<string, string> = {};
        this.metodos.forEach(m => map[m.value] = m.label);
        return map;
    }

    get tipoLabels(): Record<string, string> {
        const map: Record<string, string> = {};
        this.tipos.forEach(t => map[t.value] = t.label);
        return map;
    }

    get consolidado(): VehiculoConsolidado[] {
        const map = new Map<string, VehiculoConsolidado>();
        for (const v of VEHICULOS_TANQUE) {
            const cargas = this.registros.filter(r => r.idVehiculo === v.id);
            map.set(v.id, {
                id: v.id,
                placa: v.placa,
                desc: v.label,
                capacidadTanque: v.capacidadTanque,
                totalCargas: cargas.length,
                totalLitros: cargas.reduce((s, r) => s + r.litrosCargados, 0),
                totalGastado: cargas.reduce((s, r) => s + r.costoTotal, 0),
                ultimaCarga: cargas.length ? cargas.sort((a, b) => b.fecha.localeCompare(a.fecha))[0] : null,
            });
        }
        return Array.from(map.values());
    }

    getNivelLabel(value: number): string {
        return this.niveles.find(n => n.value === value)?.label ?? `${value * 100}%`;
    }

    get consumoTanque(): number {
        return this.registros.reduce((s, r) => s + r.litrosCargados, 0);
    }

    get costoTotalGlobal(): number {
        return this.registros.reduce((s, r) => s + r.costoTotal, 0);
    }

    openNew() {
        this.editingRecord = {} as CargaCombustible;
        this.dialogVisible = true;
    }

    openEdit(record: CargaCombustible) {
        this.editingRecord = { ...record };
        this.dialogVisible = true;
    }

    onSave(carga: CargaCombustible) {
        const idx = this.registros.findIndex(r => r.id === carga.id);
        if (idx >= 0) {
            this.registros[idx] = { ...carga };
            this.registros = [...this.registros].sort((a, b) => b.fecha.localeCompare(a.fecha));
        } else {
            carga.id = `fuel-${Date.now()}`;
            this.registros.unshift(carga);
            this.registros = [...this.registros];
        }
    }

    deleteRecord(record: CargaCombustible) {
        this.registros = this.registros.filter(r => r.id !== record.id);
    }

    getSeverity(metodo: string): 'info' | 'success' | 'warn' {
        switch (metodo) {
            case 'TANQUE': return 'info';
            case 'ODOMETRO': return 'success';
            case 'GPS': return 'warn';
            default: return 'info';
        }
    }
}

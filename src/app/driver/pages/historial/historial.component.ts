import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

import { DriverStoreService } from '../../services/driver-store.service';
import { Entrega } from '../../services/driver-store.service';

@Component({
    selector: 'app-historial',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './historial.component.html',
})
export class HistorialComponent {
    store = inject(DriverStoreService);

    historialFiltro = signal<'todas' | 'finalizadas' | 'canceladas' | 'incidencias'>('todas');
    municipioFiltro = signal<string>('todas');
    selectedGuia = signal<Entrega | null>(null);

    get historialFiltradas(): Entrega[] {
        const f = this.historialFiltro();
        const m = this.municipioFiltro();
        let lista = this.store.guiasCompletadas();
        if (m !== 'todas') lista = lista.filter((g) => g.ruta === m);
        switch (f) {
            case 'finalizadas':
                lista = lista.filter((g) => g.estado === 'finalizado');
                break;
            case 'canceladas':
                lista = lista.filter((g) => g.estado === 'cancelado');
                break;
            case 'incidencias':
                lista = lista.filter(
                    (g) => g.incidencia !== undefined || g.tuvoDevolucion || !!g.observaciones,
                );
                break;
        }
        return [...lista].reverse();
    }

    setHistorialFiltro(f: string) {
        this.historialFiltro.set(f as any);
        this.selectedGuia.set(null);
    }

    setMunicipioFiltro(m: string) {
        this.municipioFiltro.set(m);
        this.selectedGuia.set(null);
    }

    toggleSelectedGuia(g: Entrega) {
        this.selectedGuia.set(this.selectedGuia()?.id === g.id ? null : g);
    }
}

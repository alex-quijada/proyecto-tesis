import { Component, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import { DriverStoreService } from '../../services/driver-store.service';

@Component({
    selector: 'app-guia-detalle',
    standalone: true,
    imports: [CommonModule, ButtonModule, TagModule],
    templateUrl: './guia-detalle.component.html',
})
export class GuiaDetalleComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    store = inject(DriverStoreService);

    private guiaId = this.route.snapshot.paramMap.get('id') || '';

    guia = computed(() => this.store.guiasAgrupadas().find((g) => g.id === this.guiaId));

    ngOnInit() {
        void this.store.verificarDatosAlEntrar();
    }

    getNumeroParada(idFactura: string): number | null {
        const viaje = this.store.activeViaje();
        if (!viaje?.paradas) return null;
        const parada = viaje.paradas.find((p) => p.id_factura === idFactura);
        return parada?.orden_visita ?? null;
    }

    totalFacturas(): number {
        const guia = this.guia();
        return guia ? guia.facturas.reduce((sum, f) => sum + (f.precioCarga || 0), 0) : 0;
    }

    volver() {
        this.router.navigate(['/driver/home']);
    }
}

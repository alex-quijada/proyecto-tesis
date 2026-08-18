import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';

import { ViajeService } from '@/app/services/viaje.service';
import { AuthService } from '@/app/auth/service/auth.service';
import { ViajeAdmin } from '@/app/services/viaje.types';

export const TIPOS_INCIDENCIA_RECUPERABLES = [
    'FUERA_HORARIO',
    'CERRADO',
    'FALTANTE',
    'DANADO',
];

interface HistorialParada {
    idFactura: string;
    numeroFactura: string;
    numeroGuia: string;
    cliente: string;
    municipio: string;
    estado: string;
    incidenciaTipo?: string;
    incidenciaDescripcion?: string;
    incidenciaFoto?: string;
    incidenciaFecha?: string;
}

interface HistorialViaje {
    viaje: ViajeAdmin;
    paradas: HistorialParada[];
}

@Component({
    selector: 'app-historial-entregas',
    standalone: true,
    imports: [CommonModule, TagModule, ButtonModule, SkeletonModule, TableModule],
    templateUrl: './historial-entregas.component.html',
})
export class HistorialEntregasComponent implements OnInit {
    private viajeService = inject(ViajeService);
    private authService = inject(AuthService);

    cargando = signal(true);
    private viajesFinalizados = signal<ViajeAdmin[]>([]);
    private incidenciasMap = new Map<string, any>();

    historial = computed<HistorialViaje[]>(() =>
        this.viajesFinalizados()
            .map((v) => ({ viaje: v, paradas: this.mapearParadas(v) }))
            .filter((h) => h.paradas.length > 0),
    );

    constructor() {}

    async ngOnInit() {
        try {
            const [viajes, incidencias] = await Promise.all([
                this.viajeService.obtenerViajes(),
                this.authService.client
                    .from('incidencias')
                    .select(
                        'id_detalle_fact, tipo_incidencia, descripcion, foto_evidencia_url, hora_reporte',
                    )
                    .order('hora_reporte', { ascending: false }),
            ]);
            for (const inc of (incidencias.data || []) as any[]) {
                if (!this.incidenciasMap.has(inc.id_detalle_fact)) {
                    this.incidenciasMap.set(inc.id_detalle_fact, inc);
                }
            }
            this.viajesFinalizados.set(
                (viajes || []).filter((v) => v.estado === 'finalizado'),
            );
        } catch (err) {
            console.error('Error cargando historial de entregas:', err);
        } finally {
            this.cargando.set(false);
        }
    }

    private mapearParadas(v: ViajeAdmin): HistorialParada[] {
        return (v.paradas || []).map((p) => {
            const inc = this.incidenciasMap.get(p.id_factura);
            return {
                idFactura: p.id_factura,
                numeroFactura: p.numero_factura || '',
                numeroGuia: p.codigo_guia || '',
                cliente: p.nombre_cliente || '—',
                municipio: p.municipio || '',
                estado: p.estado_factura || '',
                incidenciaTipo: inc?.tipo_incidencia,
                incidenciaDescripcion: inc?.descripcion,
                incidenciaFoto: inc?.foto_evidencia_url,
                incidenciaFecha: inc?.hora_reporte,
            };
        });
    }

    esRecuperable(tipo?: string): boolean {
        return !!tipo && TIPOS_INCIDENCIA_RECUPERABLES.includes(tipo);
    }

    estadoSeverity(estado: string): 'success' | 'danger' | 'warn' | 'info' | 'secondary' {
        switch (estado) {
            case 'finalizado':
                return 'success';
            case 'incidencia':
                return 'danger';
            case 'entrega':
            case 'espera':
                return 'warn';
            case 'proceso':
                return 'info';
            default:
                return 'secondary';
        }
    }

    estadoLabel(estado: string): string {
        switch (estado) {
            case 'finalizado':
                return 'Entregado';
            case 'incidencia':
                return 'Incidencia';
            case 'entrega':
                return 'Entregando';
            case 'espera':
                return 'En espera';
            case 'proceso':
                return 'En camino';
            case 'embarque':
                return 'En carga';
            default:
                return estado || '—';
        }
    }

    formatFecha(fecha?: string | null): string {
        if (!fecha) return '—';
        return new Date(fecha).toLocaleString('es-VE', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
}

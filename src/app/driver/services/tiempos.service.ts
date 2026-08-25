import { Injectable, OnDestroy, signal } from '@angular/core';

import { ESTADOS_FACTURA } from '@/app/admin/pages/rutas/data/rutas-mock';
import { Entrega } from './driver-store.service';

/**
 * Tiempos y presentación de estados del chofer.
 *
 * Centraliza:
 *  - ticker `now` (reloj reactivo que se actualiza cada 30 s),
 *  - colores / labels / severities de estados,
 *  - tiempos transcurridos: carga (desde 'embarque'), y tiempo en el
 *    estado actual de una factura (desde su última transición).
 *
 * Se provee en DriverLayout (misma vida que el store). No depende del
 * store (recibe la `Entrega` como parámetro) para evitar ciclos de DI.
 */
@Injectable()
export class TiemposService implements OnDestroy {
    readonly now = signal(new Date());

    private timerId: ReturnType<typeof setInterval> | null = null;

    constructor() {
        this.timerId = setInterval(() => this.now.set(new Date()), 30000);
    }

    ngOnDestroy() {
        if (this.timerId) clearInterval(this.timerId);
        this.timerId = null;
    }

    // ---------------- Estados: presentación ----------------

    getEstadoLabel(e: string): string {
        if (e === 'cancelado' || e === 'CANCELADO') return 'Cancelado';
        const found = ESTADOS_FACTURA.find((ef) => ef.value === e);
        return found?.label || e;
    }

    getEstadoSeverity(
        e: string,
    ): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        if (e === 'cancelado' || e === 'CANCELADO') return 'danger';
        const found = ESTADOS_FACTURA.find((ef) => ef.value === e);
        return (found?.severity as any) || 'info';
    }

    getColorBorde(e: string): string {
        switch (e) {
            case 'nuevo':
                return 'border-l-surface-300';
            case 'embarque':
                return 'border-l-yellow-500';
            case 'proceso':
                return 'border-l-blue-500';
            case 'espera':
                return 'border-l-orange-500';
            case 'entrega':
                return 'border-l-fuchsia-500';
            case 'incidencia':
                return 'border-l-red-500';
            case 'finalizado':
                return 'border-l-green-500';
            default:
                return 'border-l-surface-300';
        }
    }

    // ---------------- Tiempos ----------------

    /** Minutos transcurridos desde una fecha (o null si inválida). */
    private minutosDesde(fecha?: string): number | null {
        if (!fecha) return null;
        const d = new Date(fecha);
        if (isNaN(d.getTime())) return null;
        return Math.floor((this.now().getTime() - d.getTime()) / 60000);
    }

    /** "X min" formateado. */
    private formatearMinutos(mins: number): string {
        if (mins < 1) return 'Menos de 1 min';
        return `${mins} min`;
    }

    /**
     * Tiempo real de carga: desde que la factura entró a 'embarque'.
     * Fallback: estimación por posición de guía.
     */
    getTiempoCarga(entrega: Entrega): string {
        const mins = this.minutosDesde(entrega?.fechaInicioCarga);
        if (mins !== null) {
            return `${this.formatearMinutos(mins)} subiendo mercancía`;
        }
        return 'Pendiente';
    }

    /**
     * Tiempo en el estado actual de la factura: desde su última transición
     * (fechaUltimoCambio). El texto incluye el label del estado.
     * Ej: "15 min · En proceso", "5 min · En espera".
     */
    getTiempoEstado(entrega: Entrega): string {
        if (!entrega) return '';
        const mins = this.minutosDesde(entrega.fechaUltimoCambio);
        if (mins === null) return '';
        const label = this.getEstadoLabel(entrega.estado);
        return `${this.formatearMinutos(mins)} · ${label}`;
    }
}

import { Injectable, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';

export type PosicionToast =
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right'
    | 'center';

export interface OpcionesNotificacion {
    /** Posición del toast (por llamada). Si no se indica, usa la configuración actual. */
    position?: PosicionToast;
    /** Vida en ms. Si no se indica, usa el default configurado. */
    life?: number;
    /** Mantiene el toast hasta cerrarlo manualmente. */
    sticky?: boolean;
    /** Clave del toast (para rutar a un p-toast específico con key). */
    key?: string;
}

/**
 * Servicio compartido de notificaciones (toasts).
 *
 * Centraliza el `MessageService` de PrimeNG con un único `<p-toast>` global
 * montado en AppComponent, configurable:
 *  - posición global (`setPosicion`) o por llamada,
 *  - vida por defecto configurable,
 *  - helpers tipados: success / error / warn / info.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
    private messageService = inject(MessageService);

    /** Posición global del toast. Se puede cambiar en runtime. */
    readonly posicion = signal<PosicionToast>('top-right');

    private vidaPorDefecto = 4000;

    /** Configura la posición global y/o la vida por defecto. */
    config(opciones: { position?: PosicionToast; life?: number }): void {
        if (opciones.position) this.posicion.set(opciones.position);
        if (opciones.life != null) this.vidaPorDefecto = opciones.life;
    }

    /** Cambia la posición global del toast. */
    setPosicion(position: PosicionToast): void {
        this.posicion.set(position);
    }

    success(summary: string, detail?: string, opciones?: OpcionesNotificacion): void {
        this.mostrar('success', summary, detail, opciones);
    }

    error(summary: string, detail?: string, opciones?: OpcionesNotificacion): void {
        this.mostrar('error', summary, detail, opciones);
    }

    warn(summary: string, detail?: string, opciones?: OpcionesNotificacion): void {
        this.mostrar('warn', summary, detail, opciones);
    }

    info(summary: string, detail?: string, opciones?: OpcionesNotificacion): void {
        this.mostrar('info', summary, detail, opciones);
    }

    /**
     * API compatible con MessageService.add para facilitar la migración:
     * acepta el mismo objeto { severity, summary, detail, life, sticky, key }.
     */
    add(message: {
        severity?: string;
        summary?: string;
        detail?: string;
        life?: number;
        sticky?: boolean;
        key?: string;
    }): void {
        this.messageService.add(message as any);
    }

    private mostrar(
        severity: 'success' | 'error' | 'warn' | 'info',
        summary: string,
        detail?: string,
        opciones?: OpcionesNotificacion,
    ): void {
        this.messageService.add({
            severity,
            summary,
            detail,
            life: opciones?.life ?? (opciones?.sticky ? undefined : this.vidaPorDefecto),
            sticky: opciones?.sticky,
            key: opciones?.key,
        });
    }
}

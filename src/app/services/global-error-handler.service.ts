import { ErrorHandler, Injectable, Injector, inject } from '@angular/core';
import { MessageService } from 'primeng/api';

/**
 * Manejador global de excepciones para la aplicación.
 *
 * Funcionalidades:
 * 1. Detección y auto-recuperación de fallos de carga de chunks dinámicos (Lazy loading / Network glitches / Despliegues).
 * 2. Notificación visual mediante Toast no intrusivo al usuario cuando ocurre un error no capturado.
 * 3. Prevención de bloqueos silenciosos en modo Zoneless.
 */
@Injectable({
    providedIn: 'root',
})
export class GlobalErrorHandler implements ErrorHandler {
    private injector = inject(Injector);
    private lastErrorToastTime = 0;
    private readonly TOAST_THROTTLE_MS = 2500;

    handleError(error: unknown): void {
        const errMessage = this.extractErrorMessage(error);

        // 1) Detección de fallos de carga de chunks (Lazy loading modules)
        if (this.isChunkLoadError(error, errMessage)) {
            console.warn('[GlobalErrorHandler] Error de carga de chunk detectado. Intentando recarga limpia...');
            this.handleChunkLoadError();
            return;
        }

        // 2) Log detallado en consola para depuración
        console.error('[GlobalErrorHandler] Excepción no capturada:', error);

        // 3) Notificar al usuario vía Toast (con throttle para evitar spam en loops)
        this.notifyUser(errMessage);
    }

    private isChunkLoadError(error: unknown, message: string): boolean {
        const lower = message.toLowerCase();
        return (
            lower.includes('chunkloaderror') ||
            lower.includes('failed to fetch dynamically imported module') ||
            lower.includes('loading chunk') ||
            lower.includes('error loading module')
        );
    }

    private handleChunkLoadError(): void {
        const reloadKey = 'last_chunk_reload_ts';
        const lastReload = parseInt(sessionStorage.getItem(reloadKey) || '0', 10);
        const now = Date.now();

        // Si no se ha recargado en los últimos 15 segundos, recarga automáticamente
        if (now - lastReload > 15000) {
            sessionStorage.setItem(reloadKey, now.toString());
            window.location.reload();
        } else {
            // Si ya se recargó y sigue fallando, notifica error de red
            this.notifyUser('Problema de conexión al cargar el módulo. Verifique su red.');
        }
    }

    private notifyUser(detailMessage: string): void {
        const now = Date.now();
        if (now - this.lastErrorToastTime < this.TOAST_THROTTLE_MS) {
            return;
        }
        this.lastErrorToastTime = now;

        try {
            const messageService = this.injector.get(MessageService, null);
            if (messageService) {
                messageService.add({
                    severity: 'error',
                    summary: 'Inconveniente Inesperado',
                    detail: this.sanitizeUserMessage(detailMessage),
                    life: 5000,
                });
            }
        } catch {
            // Ignorar si el MessageService no está disponible aún
        }
    }

    private extractErrorMessage(error: unknown): string {
        if (!error) return 'Error desconocido';
        if (typeof error === 'string') return error;
        if (error instanceof Error) return error.message;
        if (typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
            return (error as any).message;
        }
        return String(error);
    }

    private sanitizeUserMessage(msg: string): string {
        if (!msg || msg.trim().length === 0) {
            return 'Ocurrió un error inesperado al procesar la operación.';
        }
        // Si el mensaje es muy técnico o contiene trazas internas, simplificar para el usuario
        if (msg.includes('ExpressionChangedAfterItHasBeenCheckedError') || msg.includes('NG0')) {
            return 'Se produjo un conflicto en la sincronización visual.';
        }
        if (msg.length > 120) {
            return msg.substring(0, 117) + '...';
        }
        return msg;
    }
}

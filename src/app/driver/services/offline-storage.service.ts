import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export interface CacheEntry<T> {
    ts: number;
    data: T;
}

/**
 * Almacenamiento local persistente para el modo offline del chofer.
 * Usa @capacitor/preferences (SharedPreferences en Android, localStorage en web).
 * Claves por usuario: offline:{uid}:{colección}.
 */
@Injectable({ providedIn: 'root' })
export class OfflineStorageService {
    private prefijo(uid: string): string {
        return `offline:${uid}`;
    }

    private key(uid: string, nombre: string): string {
        return `${this.prefijo(uid)}:${nombre}`;
    }

    async guardar<T>(uid: string, nombre: string, data: T): Promise<void> {
        const entry: CacheEntry<T> = { ts: Date.now(), data };
        try {
            await Preferences.set({ key: this.key(uid, nombre), value: JSON.stringify(entry) });
        } catch (err) {
            console.error(`[Offline] Error guardando ${nombre}:`, err);
        }
    }

    async leer<T>(uid: string, nombre: string): Promise<CacheEntry<T> | null> {
        try {
            const { value } = await Preferences.get({ key: this.key(uid, nombre) });
            if (!value) return null;
            return JSON.parse(value) as CacheEntry<T>;
        } catch (err) {
            console.error(`[Offline] Error leyendo ${nombre}:`, err);
            return null;
        }
    }

    async eliminar(uid: string, nombre: string): Promise<void> {
        try {
            await Preferences.remove({ key: this.key(uid, nombre) });
        } catch (err) {
            console.error(`[Offline] Error eliminando ${nombre}:`, err);
        }
    }
}

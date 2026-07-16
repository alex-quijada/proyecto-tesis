import { Injectable, inject, signal } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '@/app/auth/service/auth.service';

export interface MunicipioItem {
    label: string;
    value: string;
}

const FALLBACK: MunicipioItem[] = [
    { label: 'Antolín del Campo', value: 'ca688dbd-e098-437f-a4dd-950d8e22715c' },
    { label: 'Arismendi', value: 'b296c432-4c47-4251-a38d-e8ac3cdafb63' },
    { label: 'Díaz', value: '3b568ab8-1fc3-46ae-99b3-43d58fb4c4ad' },
    { label: 'García', value: '66f23356-6246-4c01-a6da-b7c59326c8f9' },
    { label: 'Gómez', value: '020bff72-e966-4356-9664-e860ea9c1e41' },
    { label: 'Maneiro', value: 'a1f6d9e1-d999-4e04-a1b0-f80a32e072d3' },
    { label: 'Marcano', value: 'bdc8027f-3d0f-4ec0-b4c3-45ca8637d6db' },
    { label: 'Mariño', value: 'd1b9ed3e-d2d9-420e-9158-d01e35e79784' },
    { label: 'Península de Macanao', value: 'dd76c370-a034-4fef-8046-7782b41832b1' },
    { label: 'Tubores', value: '40844c65-3bee-4d1f-a87e-588652a8cb82' },
    { label: 'Villalba', value: '1d380be4-9b76-4230-a83c-67c796d6215c' },
];

@Injectable({ providedIn: 'root' })
export class MunicipioService {
    private authService = inject(AuthService);

    private get supabase(): SupabaseClient {
        return this.authService.client;
    }

    readonly items = signal<MunicipioItem[]>(FALLBACK);
    readonly loaded = signal(false);
    private loadingPromise: Promise<void> | null = null;

    async obtenerTodos(): Promise<MunicipioItem[]> {
        if (this.loaded()) return this.items();

        if (!this.loadingPromise) {
            this.loadingPromise = this._cargar();
        }
        await this.loadingPromise;
        return this.items();
    }

    private async _cargar(): Promise<void> {
        try {
            const { data, error } = await this.supabase.rpc('obtener_municipios');
            if (!error && data?.length) {
                this.items.set(
                    data.map((m: any) => ({
                        label: m.nombre,
                        value: m.id_municipio,
                    })),
                );
            }
        } catch {
            console.warn('MunicipioService: error al cargar, usando fallback');
        }
        this.loaded.set(true);
    }
}

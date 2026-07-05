import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '@/app/auth/service/auth.service';
import { MUNICIPIOS_NUEVA_ESPARTA } from '../data/rutas-mock';

interface EmpresaItem {
    id_empresa: string;
    nombre_empresa: string;
    prefijo: string;
}

const EMPRESAS_FALLBACK: EmpresaItem[] = [
    { id_empresa: 'ANGELO', nombre_empresa: 'Inversiones Angelo, C.A.', prefijo: 'INVERSIONES ANGELO, C.A.' },
    { id_empresa: 'METROPOL', nombre_empresa: 'Distribuidora Metropol C.A.', prefijo: 'DISTRIBUIDORA METROPOL C.A.' },
    { id_empresa: 'MALESI', nombre_empresa: 'Inversiones Malesi, C.A.', prefijo: 'INVERSIONES MALESI, C.A.' },
];

@Injectable({
    providedIn: 'root',
})
export class RutaService {
    private authService = inject(AuthService);

    private get supabase(): SupabaseClient {
        return this.authService.client;
    }

    async obtenerEmpresas(): Promise<{ label: string; value: string }[]> {
        try {
            const { data, error } = await this.supabase
                .from('empresas')
                .select('id_empresa, empresa');
            if (!error && data?.length) {
                return data.map((e) => ({
                    label: e.empresa,
                    value: e.id_empresa,
                }));
            }
        } catch {
            /* fallback */
        }
        return EMPRESAS_FALLBACK.map((e) => ({ label: e.nombre_empresa, value: e.prefijo }));
    }

    async obtenerMunicipios(): Promise<{ label: string; value: string }[]> {
        try {
            const { data, error } = await this.supabase.rpc('obtener_municipios');
            if (!error && data?.length) {
                return data.map((m: any) => ({
                    label: m.nombre,
                    value: m.id_municipio,
                }));
            }
        } catch {
            /* fallback */
        }
        return MUNICIPIOS_NUEVA_ESPARTA;
    }
}

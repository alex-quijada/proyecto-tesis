import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '@/app/auth/service/auth.service';
import { traducirErrorDuplicado } from '@/app/services/errores.util';
import { Vehiculo } from '../data/vehiculos-mock';

@Injectable({
    providedIn: 'root',
})
export class VehiculoService {
    private authService = inject(AuthService);

    private get supabase(): SupabaseClient {
        return this.authService.client;
    }

    async obtenerVehiculos(): Promise<Vehiculo[]> {
        const { data, error } = await this.supabase.rpc('obtener_vehiculos');

        if (error) throw new Error(`Error al cargar vehículos: ${error.message}`);

        return (data || []).map(
            (row: any): Vehiculo => ({
                id_vehiculo: row.id_vehiculo,
                id: row.id_vehiculo,
                placa: row.placa || '',
                marca: row.marca || '',
                modelo: row.modelo || '',
                anio: row.anio,
                tipo: row.tipo_nombre,
                tipoCaja: row.caja_nombre,
                capacidadPallets: row.capacidad_pallets ?? 0,
                pesoMaximo: row.peso_maximo ? Number(row.peso_maximo) : 0,
                estado: row.estado_nombre,
            }),
        );
    }

    async obtenerCatalogosVehiculos(): Promise<{
        tiposVehiculo: { label: string; value: string }[];
        tiposCaja: { label: string; value: string }[];
        estados: { label: string; value: string }[];
    }> {
        const { data, error } = await this.supabase.rpc('obtener_catalogos_vehiculos');

        if (error) throw new Error(`Error al cargar catálogos: ${error.message}`);

        return {
            tiposVehiculo: data?.tiposVehiculo || [],
            tiposCaja: data?.tiposCaja || [],
            estados: data?.estados || [],
        };
    }

    private formatearError(contexto: string, err: any): Error {
        const duplicado = traducirErrorDuplicado(
            err,
            { placa: 'La placa ya está registrada.' },
            'Ya existe un registro con ese valor.',
        );
        if (duplicado) return new Error(duplicado);
        return new Error(`${contexto}: ${err?.message}`);
    }

    async crearVehiculo(vehiculo: Vehiculo): Promise<string> {
        const { data, error } = await this.supabase.rpc('crear_vehiculo', {
            p_placa: vehiculo.placa || '',
            p_marca: vehiculo.marca || '',
            p_modelo: vehiculo.modelo || '',
            p_anio: vehiculo.anio || new Date().getFullYear(),
            p_tipo_nombre: vehiculo.tipo || 'CARRO',
            p_caja_nombre: vehiculo.tipoCaja || 'SECA',
            p_capacidad_pallets: vehiculo.capacidadPallets ?? 0,
            p_peso_maximo: vehiculo.pesoMaximo ?? 0,
            p_estado_nombre: vehiculo.estado || 'OPERATIVO',
        });

        if (error) throw this.formatearError('Error al crear vehículo', error);
        return data;
    }

    async actualizarVehiculo(vehiculo: Vehiculo): Promise<void> {
        const { error } = await this.supabase.rpc('actualizar_vehiculo', {
            p_id_vehiculo: vehiculo.id_vehiculo || vehiculo.id,
            p_placa: vehiculo.placa || '',
            p_marca: vehiculo.marca || '',
            p_modelo: vehiculo.modelo || '',
            p_anio: vehiculo.anio || new Date().getFullYear(),
            p_tipo_nombre: vehiculo.tipo || 'CARRO',
            p_caja_nombre: vehiculo.tipoCaja || 'SECA',
            p_capacidad_pallets: vehiculo.capacidadPallets ?? 0,
            p_peso_maximo: vehiculo.pesoMaximo ?? 0,
            p_estado_nombre: vehiculo.estado || 'OPERATIVO',
        });

        if (error) throw this.formatearError('Error al actualizar vehículo', error);
    }

    async eliminarVehiculo(id: string): Promise<void> {
        const { error } = await this.supabase.rpc('eliminar_vehiculo', {
            p_id_vehiculo: id,
        });

        if (error) throw this.formatearError('Error al eliminar vehículo', error);
    }
}

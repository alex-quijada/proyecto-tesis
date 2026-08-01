import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '@/app/auth/service/auth.service';
import { MUNICIPIOS_NUEVA_ESPARTA, GuiaDespacho, FacturaGuia } from '../data/rutas-mock';

interface EmpresaItem {
    id_empresa: string;
    nombre_empresa: string;
    prefijo: string;
}

const EMPRESAS_FALLBACK: EmpresaItem[] = [
    {
        id_empresa: 'ANGELO',
        nombre_empresa: 'Inversiones Angelo, C.A.',
        prefijo: 'INVERSIONES ANGELO, C.A.',
    },
    {
        id_empresa: 'METROPOL',
        nombre_empresa: 'Distribuidora Metropol C.A.',
        prefijo: 'DISTRIBUIDORA METROPOL C.A.',
    },
    {
        id_empresa: 'MALESI',
        nombre_empresa: 'Inversiones Malesi, C.A.',
        prefijo: 'INVERSIONES MALESI, C.A.',
    },
];

@Injectable({
    providedIn: 'root',
})
export class RutaService {
    private authService = inject(AuthService);

    private get supabase(): SupabaseClient {
        return this.authService.client;
    }

    private readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    private esUUID(valor: string): boolean {
        return this.UUID_REGEX.test(valor);
    }

    private async resolverIdEmpresa(valor: string): Promise<string | null> {
        if (!valor) return null;
        if (this.esUUID(valor)) return valor;
        const { data } = await this.supabase
            .from('empresas')
            .select('id_empresa')
            .eq('empresa', valor)
            .maybeSingle();
        return data?.id_empresa || null;
    }

    private async obtenerIdEstadoNuevo(): Promise<string> {
        const { data } = await this.supabase
            .from('estados')
            .select('id_estado')
            .eq('nombre_estado', 'nuevo')
            .single();
        return data?.id_estado;
    }

    async crearGuia(guia: GuiaDespacho): Promise<GuiaDespacho> {
        const user = this.authService.getCurrentUser();
        if (!user) throw new Error('Usuario no autenticado');

        const idEmpresa = await this.resolverIdEmpresa(guia.empresa);
        const idEstadoNuevo = await this.obtenerIdEstadoNuevo();

        const { data: nuevaGuia, error: errGuia } = await this.supabase
            .from('guias_carga')
            .insert({
                codigo_guia: guia.codigoGuia || null,
                fecha_despacho:
                    guia.fechaCreacion?.split('T')[0] || new Date().toISOString().split('T')[0],
                id_vehiculo: guia.idVehiculo,
                id_chofer: guia.idChofer,
                id_ayudante: guia.idAyudante || null,
                id_analista: user.id,
                id_empresa: idEmpresa,
                id_municipio: guia.municipio && this.esUUID(guia.municipio) ? guia.municipio : null,
                observaciones: guia.observaciones || null,
            })
            .select('id_guia')
            .single();

        if (errGuia) throw errGuia;

        if (guia.facturas?.length) {
            const facturasDb = guia.facturas.map((f) => ({
                id_guia: nuevaGuia.id_guia,
                num_factura: f.numeroFactura,
                id_sucursal: f.idSucursal,
                monto_dolares: f.totalUSD,
                monto_bss: f.totalVES,
                id_estado: idEstadoNuevo,
            }));

            const { data: facturasCreadas, error: errFacturas } = await this.supabase
                .from('facturas')
                .insert(facturasDb)
                .select('id_factura');

            if (errFacturas) throw errFacturas;

            if (facturasCreadas?.length) {
                await Promise.all(
                    facturasCreadas.map((f) =>
                        this.supabase.from('historial_estados_factura').insert({
                            id_factura: f.id_factura,
                            id_estado_anterior: null,
                            id_estado_nuevo: idEstadoNuevo,
                            id_usuario: user.id,
                            observacion: null,
                        }),
                    ),
                );
            }
        }

        return { ...guia, id: nuevaGuia.id_guia };
    }

    async actualizarGuia(guia: GuiaDespacho): Promise<GuiaDespacho> {
        const user = this.authService.getCurrentUser();
        if (!user) throw new Error('Usuario no autenticado');
        if (!guia.id) throw new Error('La guía debe tener un ID para ser actualizada');

        const idEmpresa = await this.resolverIdEmpresa(guia.empresa);
        const idEstadoNuevo = await this.obtenerIdEstadoNuevo();

        const { error: errGuia } = await this.supabase
            .from('guias_carga')
            .update({
                codigo_guia: guia.codigoGuia || null,
                fecha_despacho:
                    guia.fechaCreacion?.split('T')[0] || new Date().toISOString().split('T')[0],
                id_vehiculo: guia.idVehiculo,
                id_chofer: guia.idChofer,
                id_ayudante: guia.idAyudante || null,
                id_analista: user.id,
                id_empresa: idEmpresa,
                id_municipio: guia.municipio && this.esUUID(guia.municipio) ? guia.municipio : null,
                observaciones: guia.observaciones || null,
            })
            .eq('id_guia', guia.id);

        if (errGuia) throw errGuia;

        // Load existing facturas for this guia
        const { data: facturasExistentes } = await this.supabase
            .from('facturas')
            .select('id_factura')
            .eq('id_guia', guia.id);

        const idsExistentes = new Set((facturasExistentes || []).map((f: any) => f.id_factura));
        const idsEntrantes = new Set(guia.facturas.filter((f) => f.id).map((f) => f.id));

        // Remove facturas that are no longer in the list
        const idsEliminar = [...idsExistentes].filter((id) => !idsEntrantes.has(id));
        if (idsEliminar.length) {
            await this.supabase.from('facturas').delete().in('id_factura', idsEliminar);
        }

        // Upsert facturas
        for (const f of guia.facturas) {
            if (f.id && idsExistentes.has(f.id)) {
                await this.supabase
                    .from('facturas')
                    .update({
                        num_factura: f.numeroFactura,
                        id_sucursal: f.idSucursal,
                        monto_dolares: f.totalUSD,
                        monto_bss: f.totalVES,
                    })
                    .eq('id_factura', f.id);
            } else {
                const { data: nuevaFactura } = await this.supabase
                    .from('facturas')
                    .insert({
                        id_guia: guia.id,
                        num_factura: f.numeroFactura,
                        id_sucursal: f.idSucursal,
                        monto_dolares: f.totalUSD,
                        monto_bss: f.totalVES,
                        id_estado: idEstadoNuevo,
                    })
                    .select('id_factura')
                    .single();

                if (nuevaFactura?.id_factura) {
                    await this.supabase.from('historial_estados_factura').insert({
                        id_factura: nuevaFactura.id_factura,
                        id_estado_anterior: null,
                        id_estado_nuevo: idEstadoNuevo,
                        id_usuario: user.id,
                        observacion: null,
                    });
                }
            }
        }

        return guia;
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
            console.warn('obtenerMunicipios RPC falló, usando fallback');
        }
        return MUNICIPIOS_NUEVA_ESPARTA;
    }

    private readonly DIA_TO_INT: Record<string, number> = {
        LUNES: 1,
        MARTES: 2,
        MIERCOLES: 3,
        JUEVES: 4,
        VIERNES: 5,
        SABADO: 6,
    };

    private readonly INT_TO_DIA: Record<number, string> = {
        1: 'LUNES',
        2: 'MARTES',
        3: 'MIERCOLES',
        4: 'JUEVES',
        5: 'VIERNES',
        6: 'SABADO',
    };

    private readonly DIA_LABELS: Record<string, string> = {
        LUNES: 'Lunes',
        MARTES: 'Martes',
        MIERCOLES: 'Miércoles',
        JUEVES: 'Jueves',
        VIERNES: 'Viernes',
        SABADO: 'Sábado',
    };

    async obtenerCronograma(): Promise<
        { dia: string; label: string; municipios: string[] }[] | null
    > {
        try {
            const { data, error } = await this.supabase
                .from('municipios_cronograma')
                .select('dia_semana, id_municipio, orden')
                .order('dia_semana', { ascending: true })
                .order('orden', { ascending: true });

            if (error) throw error;
            if (!data?.length) return null;

            const grupos = new Map<number, string[]>();
            for (const row of data) {
                const list = grupos.get(row.dia_semana) || [];
                list.push(row.id_municipio);
                grupos.set(row.dia_semana, list);
            }

            return Object.keys(this.DIA_TO_INT).map((dia) => ({
                dia,
                label: this.DIA_LABELS[dia] || dia,
                municipios: grupos.get(this.DIA_TO_INT[dia]) || [],
            }));
        } catch {
            return null;
        }
    }

    async guardarCronograma(cronograma: { dia: string; municipios: string[] }[]): Promise<void> {
        const { error: delErr } = await this.supabase
            .from('municipios_cronograma')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (delErr) throw delErr;

        const rows: { dia_semana: number; id_municipio: string; orden: number }[] = [];
        for (const dia of cronograma) {
            const diaInt = this.DIA_TO_INT[dia.dia];
            if (diaInt == null) continue;
            dia.municipios.forEach((id, idx) => {
                rows.push({ dia_semana: diaInt, id_municipio: id, orden: idx });
            });
        }

        if (rows.length) {
            const { error: insErr } = await this.supabase
                .from('municipios_cronograma')
                .insert(rows);
            if (insErr) throw insErr;
        }
    }

    async obtenerEstados(): Promise<{ id_estado: string; nombre_estado: string }[]> {
        const { data, error } = await this.supabase
            .from('estados')
            .select('id_estado, nombre_estado');
        if (error) throw error;
        return data || [];
    }

    async obtenerGuias(): Promise<GuiaDespacho[]> {
        const { data: guiasDb, error } = await this.supabase
            .from('guias_carga')
            .select(
                `
                id_guia,
                codigo_guia,
                fecha_despacho,
                fecha_registro,
                id_vehiculo,
                id_chofer,
                id_ayudante,
                id_empresa,
                id_municipio,
                observaciones,
                empresa_nombre:id_empresa ( empresa ),
                municipio_nombre:id_municipio ( nombre )
                `,
            )
            .order('fecha_registro', { ascending: false });

        if (error) throw error;
        if (!guiasDb?.length) return [];

        const userIds = new Set<string>();
        const vehiculoIds = new Set<string>();
        for (const g of guiasDb as any[]) {
            if (g.id_chofer) userIds.add(g.id_chofer);
            if (g.id_ayudante) userIds.add(g.id_ayudante);
            if (g.id_vehiculo) vehiculoIds.add(g.id_vehiculo);
        }

        const [usuariosRes, facturasRes, estadosRes, clientesRes, prioridadesRes, vehiculosRes] =
            await Promise.all([
                userIds.size
                    ? this.supabase
                          .from('usuarios')
                          .select('id_usuario, nombre_completo, cedula')
                          .in('id_usuario', [...userIds])
                    : ({ data: [] } as any),
                this.supabase
                    .from('facturas')
                    .select('*')
                    .in(
                        'id_guia',
                        (guiasDb as any[]).map((g) => g.id_guia),
                    ),
                this.supabase.from('estados').select('id_estado, nombre_estado'),
                this.supabase.rpc('obtener_clientes'),
                this.supabase.rpc('obtener_prioridades_clientes'),
                vehiculoIds.size ? this.supabase.rpc('obtener_vehiculos') : ({ data: [] } as any),
            ]);

        const usuariosMap = new Map(
            ((usuariosRes as any).data || []).map((u: any) => [u.id_usuario, u]),
        );
        const estadosMap = new Map(
            (estadosRes.data || []).map((e: any) => [e.id_estado, e.nombre_estado]),
        );
        const vehiculosMap = new Map(
            ((vehiculosRes as any).data || []).map((v: any) => [v.id_vehiculo, v]),
        );

        const clientesArr = (clientesRes.data || []) as any[];
        const prioridadesArr = (prioridadesRes.data || []) as any[];

        const clientesMap = new Map(clientesArr.map((c: any) => [c.id_cliente, c]));
        const prioridadesMap = new Map(
            prioridadesArr.map((p: any) => [p.id_prioridad, p.nombre_prioridad]),
        );

        const clienteIds = [...new Set(clientesArr.map((c: any) => c.id_cliente).filter(Boolean))];

        const sucursalesRes = await Promise.all(
            clienteIds.map((id) =>
                this.supabase
                    .rpc('obtener_sucursales_cliente', { p_cliente_id: id })
                    .then((res) => ({ clienteId: id, data: res.data || [] })),
            ),
        );

        const sucursalesMap = new Map<string, any>();
        for (const { clienteId, data } of sucursalesRes) {
            for (const s of data) {
                sucursalesMap.set(s.id, { ...s, cliente_id: clienteId });
            }
        }

        const facturasDb = facturasRes.data || [];
        const facturasPorGuia = new Map<string, FacturaGuia[]>();
        for (const f of facturasDb) {
            const suc = f.id_sucursal ? sucursalesMap.get(f.id_sucursal) : undefined;
            const cliente = suc ? clientesMap.get(suc.cliente_id) : undefined;

            const factura: FacturaGuia = {
                id: f.id_factura,
                numeroFactura: f.num_factura,
                idCliente: cliente?.id_cliente || '',
                nombreCliente: cliente?.nombre_comercial || '',
                rifCliente: cliente ? `${cliente.prefijo || ''}${cliente.numero_doc || ''}` : '',
                telefono: cliente?.telefono || '',
                direccion: '',
                idSucursal: f.id_sucursal,
                direccionSucursal: suc?.direccion || '',
                sucursalLat: suc?.latitud ?? undefined,
                sucursalLng: suc?.longitud ?? undefined,
                reglasRecepcion: suc?.reglas,
                totalUSD: Number(f.monto_dolares) || 0,
                totalVES: Number(f.monto_bss) || 0,
                prioridad:
                    prioridadesMap.get(cliente?.id_prioridad) || cliente?.nombre_prioridad || '',
                idEstado: estadosMap.get(f.id_estado) || f.id_estado,
            };

            const list = facturasPorGuia.get(f.id_guia) || [];
            list.push(factura);
            facturasPorGuia.set(f.id_guia, list);
        }

        return (guiasDb as any[]).map((g) => {
            const chofer = usuariosMap.get(g.id_chofer) as any;
            const ayudante = g.id_ayudante ? (usuariosMap.get(g.id_ayudante) as any) : undefined;
            const vehiculo = vehiculosMap.get(g.id_vehiculo) as any;

            return {
                id: g.id_guia,
                empresa: g.empresa_nombre?.empresa || '',
                numeroGuia: g.codigo_guia || g.id_guia.substring(0, 8).toUpperCase(),
                codigoGuia: g.codigo_guia || '',
                idChofer: g.id_chofer,
                nombreChofer: chofer?.nombre_completo || '',
                cedulaChofer: chofer?.cedula?.toString() || '',
                idAyudante: g.id_ayudante || undefined,
                nombreAyudante: ayudante?.nombre_completo || undefined,
                idVehiculo: g.id_vehiculo || '',
                placaVehiculo: vehiculo?.placa || '',
                camion: vehiculo ? `${vehiculo.marca} ${vehiculo.modelo}` : '',
                municipio: g.id_municipio || g.municipio_nombre?.nombre || '',
                pdfFuente: 'MANUAL' as const,
                fechaCreacion: g.fecha_registro || g.fecha_despacho || '',
                observaciones: g.observaciones || undefined,
                eventos: [],
                facturas: facturasPorGuia.get(g.id_guia) || [],
            };
        });
    }
}

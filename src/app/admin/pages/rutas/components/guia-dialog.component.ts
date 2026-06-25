import {
    Component,
    input,
    output,
    model,
    effect,
    inject,
    signal,
    computed,
    ViewChild,
    ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { FluidModule } from 'primeng/fluid';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { DividerModule } from 'primeng/divider';
import { AccordionModule } from 'primeng/accordion';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import {
    GuiaDespacho,
    FacturaGuia,
    EMPRESAS,
    MUNICIPIOS_NUEVA_ESPARTA,
    ESTADOS_GUIA,
    ESTADOS_POR_ROL,
} from '../data/rutas-mock';
import { CHOFERES_MOCK } from '../../choferes/data/choferes-mock';
import { VEHICULOS_MOCK } from '../../vehiculos/data/vehiculos-mock';
import { Cliente, SucursalCliente } from '../../clientes/clientes.types';
import { PdfNormalizerService } from '../services/pdf-parse.service';
import { environment } from '@/environments/environment';

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

@Component({
    selector: 'app-guia-dialog',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        DialogModule,
        ButtonModule,
        InputTextModule,
        InputNumberModule,
        SelectModule,
        FluidModule,
        MessageModule,
        TextareaModule,
        DividerModule,
        AccordionModule,
        TooltipModule,
        ProgressSpinnerModule,
    ],
    templateUrl: './guia-dialog.component.html',
})
export class GuiaDialogComponent {
    private fb = inject(FormBuilder);
    private pdfNormalizerService = inject(PdfNormalizerService);
    private supabase: SupabaseClient = createClient(
        environment.supabaseUrl,
        environment.supabaseKey,
    );

    @ViewChild('pdfInput') pdfInput!: ElementRef<HTMLInputElement>;

    visible = model<boolean>(false);
    guiaData = input<GuiaDespacho>({} as GuiaDespacho);
    userRole = input<string>('ADMIN');
    onSave = output<GuiaDespacho>();

    submitted = false;
    errorMessage = '';
    cargandoPDF = signal(false);

    empresasOptions = signal<{ label: string; value: string }[]>([]);
    municipios = MUNICIPIOS_NUEVA_ESPARTA;

    choferes = CHOFERES_MOCK.map((ch) => ({
        label: `${ch.nombreCompleto} (${ch.documentoIdentidad?.prefijo}-${ch.documentoIdentidad?.numero})`,
        value: ch.id!,
        nombreChofer: ch.nombreCompleto!,
        cedulaChofer: ch.documentoIdentidad
            ? `${ch.documentoIdentidad.prefijo}-${ch.documentoIdentidad.numero}`
            : '',
    }));

    vehiculos = VEHICULOS_MOCK.map((v) => ({
        label: `${v.placa} — ${v.marca} ${v.modelo} (${v.anio})`,
        value: v.id!,
        placaVehiculo: v.placa!,
        camion: `[${v.placa}] ${v.marca} ${v.modelo}`,
    }));

    clientes: Cliente[] = [
        {
            id: 'cli-1',
            documentoIdentidad: { prefijo: 'J', numero: '123456789' },
            nombreComercial: 'Distribuidora Los Andes C.A.',
            telefono: '0295-1234567',
            correo: 'contacto@distrilandesa.com',
            personaContacto: 'María Fernanda López',
            prioridad: 'Alta',
            sucursales: [
                {
                    id: 'ub-1-1',
                    direccion: 'Av. Principal, Edif. Los Andes, Piso 1',
                    idMunicipio: 'MARINO',
                    telefonoContacto: '0414-1112233',
                    nombreContacto: 'Pedro Rojas',
                    reglas: {
                        horaEntrega: '08:00-17:00',
                        diasRecepcion: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
                        requiereCita: true,
                        instrucciones: 'Solicitar identificación en recepción',
                    },
                },
                {
                    id: 'ub-1-2',
                    direccion: 'Calle Los Mangos, Local 5',
                    idMunicipio: 'DIAZ',
                    telefonoContacto: '0416-2223344',
                    nombreContacto: 'Ana Castillo',
                    reglas: {
                        horaEntrega: '09:00-15:00',
                        diasRecepcion: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'],
                        requiereCita: false,
                    },
                },
            ],
        },
        {
            id: 'cli-2',
            documentoIdentidad: { prefijo: 'V', numero: '987654321' },
            nombreComercial: 'Comercial El Ávila S.R.L.',
            telefono: '0295-7654321',
            correo: 'ventas@comercialavila.com',
            personaContacto: 'José Antonio Pérez',
            prioridad: 'Media',
            sucursales: [
                {
                    id: 'ub-2-1',
                    direccion: 'Calle Sucre, Local 3-A',
                    idMunicipio: 'MARINO',
                    telefonoContacto: '0414-5544332',
                    nombreContacto: 'Rosa Hernández',
                    reglas: {
                        horaEntrega: '08:30-17:30',
                        diasRecepcion: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
                        requiereCita: false,
                        instrucciones: 'Llamar al llegar',
                    },
                },
            ],
        },
        {
            id: 'cli-3',
            documentoIdentidad: { prefijo: 'G', numero: '456789123' },
            nombreComercial: 'Supermercado Margarita C.A.',
            telefono: '0295-4567890',
            correo: 'compras@supermargarita.com',
            personaContacto: 'Carmen Elena Salazar',
            prioridad: 'Alta',
            sucursales: [
                {
                    id: 'ub-3-1',
                    direccion: 'Av. 4 de Mayo, CC Costa Azul',
                    idMunicipio: 'MANEIRO',
                    telefonoContacto: '0412-6655778',
                    nombreContacto: 'Luisana Gil',
                    reglas: {
                        horaEntrega: '06:00-14:00',
                        diasRecepcion: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'],
                        requiereCita: false,
                        instrucciones: 'Recepción por el área de carga',
                    },
                },
                {
                    id: 'ub-3-2',
                    direccion: 'Calle Bolívar, Local 8',
                    idMunicipio: 'DIAZ',
                    telefonoContacto: '0426-9988776',
                    nombreContacto: 'José Gregorio Rivas',
                    reglas: {
                        horaEntrega: '08:00-12:00',
                        diasRecepcion: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'],
                        requiereCita: true,
                        instrucciones: 'Solo recepción en horario de mañana',
                    },
                },
            ],
        },
        {
            id: 'cli-4',
            documentoIdentidad: { prefijo: 'V', numero: '112233445' },
            nombreComercial: 'Ferretería El Martillo',
            telefono: '0295-3322114',
            correo: 'pedidos@ferremartillo.com',
            personaContacto: 'Alberto José Guzmán',
            prioridad: 'Baja',
            sucursales: [
                {
                    id: 'ub-4-1',
                    direccion: 'Av. Principal de Pampatar, Local 2',
                    idMunicipio: 'MANEIRO',
                    telefonoContacto: '0414-4433221',
                    nombreContacto: 'Marlene Rojas',
                    reglas: {
                        horaEntrega: '09:00-18:00',
                        diasRecepcion: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
                        requiereCita: false,
                    },
                },
            ],
        },
        {
            id: 'cli-5',
            documentoIdentidad: { prefijo: 'E', numero: '998877665' },
            nombreComercial: 'Importadora Caribe 3000 S.A.',
            telefono: '0295-9988776',
            correo: 'info@caribe3000.com',
            personaContacto: 'Eduardo Schwarz',
            prioridad: 'Alta',
            sucursales: [
                {
                    id: 'ub-5-1',
                    direccion: 'Zona Franca, Módulo 7',
                    idMunicipio: 'GARCIA',
                    telefonoContacto: '0424-7766554',
                    nombreContacto: 'Francisco Díaz',
                    reglas: {
                        horaEntrega: '08:00-16:00',
                        diasRecepcion: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
                        requiereCita: true,
                        instrucciones: 'Presentar documentación aduanera',
                    },
                },
                {
                    id: 'ub-5-2',
                    direccion: 'Av. Circunvalación, Edif. Caribe',
                    idMunicipio: 'MARINO',
                    telefonoContacto: '0412-1122334',
                    nombreContacto: 'Gabriela Rivas',
                    reglas: {
                        horaEntrega: '09:00-13:00',
                        diasRecepcion: ['LUN', 'MIE', 'VIE'],
                        requiereCita: true,
                        instrucciones: 'Oficina administrativa, solo recepción de documentos',
                    },
                },
            ],
        },
    ];

    clientesOptions = this.clientes.map((c) => ({
        label: c.nombreComercial || '',
        value: c.id || '',
    }));

    sucursalesPorCliente = new Map<string, SucursalCliente[]>();

    estadosDisponibles = computed(() => {
        const role = this.userRole();
        const roleKey = role === 'ADMIN' ? 'ADMIN' : role === 'ANALISTA' ? 'ANALISTA' : 'CHOFER';
        const estadosPermitidos = ESTADOS_POR_ROL[roleKey] || ESTADOS_POR_ROL['ADMIN'];
        return ESTADOS_GUIA.filter((e) => estadosPermitidos.includes(e.value));
    });

    form: FormGroup = this.fb.group({
        empresa: ['', Validators.required],
        codigoGuia: [''],
        idChofer: ['', Validators.required],
        idVehiculo: ['', Validators.required],
        municipio: ['', Validators.required],
        estado: ['NUEVO'],
        pdfFuente: ['MANUAL'],
        observaciones: [''],
        facturas: this.fb.array([]),
    });

    get facturas(): FormArray {
        return this.form.get('facturas') as FormArray;
    }

    constructor() {
        effect(() => {
            const data = this.guiaData();
            this.submitted = false;
            this.errorMessage = '';

            if (data?.id) {
                this.form.patchValue({
                    empresa: data.empresa || '',
                    codigoGuia: data.codigoGuia || '',
                    idChofer: data.idChofer || '',
                    idVehiculo: data.idVehiculo || '',
                    municipio: data.municipio || '',
                    estado: data.estado || 'NUEVO',
                    pdfFuente: data.pdfFuente || 'MANUAL',
                    observaciones: data.observaciones || '',
                });
                this.setFacturas(data.facturas || []);
            } else {
                this.form.reset({
                    empresa: '',
                    codigoGuia: '',
                    idChofer: '',
                    idVehiculo: '',
                    municipio: '',
                    estado: 'NUEVO',
                    pdfFuente: 'MANUAL',
                    observaciones: '',
                });
                this.facturas.clear();
            }
        });
    }

    async cargarEmpresas() {
        try {
            const { data, error } = await this.supabase
                .from('empresas')
                .select('id_empresa, nombre_empresa, prefijo')
                .order('nombre_empresa', { ascending: true });
            if (!error && data?.length) {
                this.empresasOptions.set(
                    data.map((e) => ({
                        label: e.nombre_empresa,
                        value: e.prefijo || e.id_empresa,
                    })),
                );
                return;
            }
        } catch {
            /* fallback */
        }
        this.empresasOptions.set(
            EMPRESAS_FALLBACK.map((e) => ({ label: e.nombre_empresa, value: e.prefijo })),
        );
    }

    scanPDF() {
        this.pdfInput.nativeElement.click();
    }

    async onPDFSelected(event: any) {
        const file: File = event.target.files[0];
        if (!file) return;

        this.cargandoPDF.set(true);
        try {
            const datos = await this.pdfNormalizerService.procesarArchivoPdf(file);
            console.log('Datos extraídos del PDF:', datos);

            this.form.patchValue({
                empresa: datos.empresa || '',
                codigoGuia: datos.codigoGuia || '',
                pdfFuente: 'PDF',
            });

            if (datos.chofer) {
                const match = this.choferes.find((ch) =>
                    ch.nombreChofer
                        .toLowerCase()
                        .includes(
                            datos.chofer.toLowerCase().split(']')[1]?.trim() ||
                                datos.chofer.toLowerCase(),
                        ),
                );
                if (match) {
                    this.form.patchValue({ idChofer: match.value });
                }
            }

            if (datos.placa) {
                const match = this.vehiculos.find(
                    (v) => v.placaVehiculo.toLowerCase() === datos.placa.toLowerCase(),
                );
                if (match) {
                    this.form.patchValue({ idVehiculo: match.value });
                }
            }

            const pdfFacturas = (datos.facturas || []).map((f, i) => ({
                id: `fact-pdf-${i}`,
                numeroFactura: f.numero || '',
                idCliente: '',
                nombreCliente: f.cliente || '',
                rifCliente: '',
                telefono: f.tlf || '',
                direccion: f.direccion || '',
                totalUSD: f.totalUSD || 0,
                totalVES: f.totalVES || 0,
                prioridad: '',
                idSucursal: '',
            }));
            this.setFacturas(pdfFacturas);
        } catch (error) {
            console.error('Error al procesar el PDF:', error);
            this.errorMessage = 'No se pudo procesar el archivo PDF.';
        } finally {
            this.cargandoPDF.set(false);
        }

        event.target.value = '';
    }

    private setFacturas(facturas: Partial<FacturaGuia>[]) {
        this.facturas.clear();
        for (const f of facturas) {
            this.facturas.push(this.createFacturaGroup(f));
        }
        if (this.facturas.length === 0) {
            this.addFactura();
        }
    }

    private createFacturaGroup(data?: Partial<FacturaGuia>): FormGroup {
        const group = this.fb.group({
            idCliente: [data?.idCliente || '', Validators.required],
            idSucursal: [data?.idSucursal || ''],
            numeroFactura: [data?.numeroFactura || '', Validators.required],
            nombreCliente: [data?.nombreCliente || ''],
            rifCliente: [data?.rifCliente || ''],
            telefono: [data?.telefono || ''],
            direccion: [data?.direccion || ''],
            totalUSD: [data?.totalUSD ?? 0, [Validators.required, Validators.min(0)]],
            totalVES: [data?.totalVES ?? 0, [Validators.required, Validators.min(0)]],
            prioridad: [data?.prioridad || ''],
            reglasRecepcion: [data?.reglasRecepcion ? JSON.stringify(data.reglasRecepcion) : ''],
        });

        if (data?.idCliente) {
            const cliente = this.clientes.find((c) => c.id === data.idCliente);
            if (cliente) {
                this.cargarSucursalesCliente(cliente);
                if (!data?.nombreCliente) {
                    group.patchValue({
                        nombreCliente: cliente.nombreComercial || '',
                        rifCliente: cliente.documentoIdentidad
                            ? `${cliente.documentoIdentidad.prefijo}-${cliente.documentoIdentidad.numero}`
                            : '',
                        telefono: cliente.telefono || '',
                        prioridad: cliente.prioridad || '',
                    });
                }
            }
        }

        return group;
    }

    addFactura() {
        this.facturas.push(this.createFacturaGroup());
    }

    removeFactura(index: number) {
        this.facturas.removeAt(index);
    }

    onClienteChange(index: number) {
        const group = this.facturas.at(index);
        const idCliente = group.get('idCliente')?.value;
        const cliente = this.clientes.find((c) => c.id === idCliente);
        if (cliente) {
            group.patchValue({
                nombreCliente: cliente.nombreComercial || '',
                rifCliente: cliente.documentoIdentidad
                    ? `${cliente.documentoIdentidad.prefijo}-${cliente.documentoIdentidad.numero}`
                    : '',
                telefono: cliente.telefono || '',
                prioridad: cliente.prioridad || '',
                direccion: '',
                idSucursal: '',
                reglasRecepcion: cliente.reglas ? JSON.stringify(cliente.reglas) : '',
            });
            this.cargarSucursalesCliente(cliente);
        }
    }

    private cargarSucursalesCliente(cliente: Cliente) {
        const id = cliente.id!;
        if (!this.sucursalesPorCliente.has(id)) {
            const sucursales = (cliente.sucursales || []).map((s) => ({
                id: s.id || '',
                direccion: s.direccion || '',
                puntoDeReferencia: s.puntoDeReferencia || '',
                idMunicipio: s.idMunicipio || '',
                telefonoContacto: s.telefonoContacto || '',
                nombreContacto: s.nombreContacto || '',
                reglas: s.reglas || {
                    diasRecepcion: [],
                    requiereCita: false,
                    instrucciones: '',
                },
                latitud: s.latitud,
                longitud: s.longitud,
            }));
            this.sucursalesPorCliente.set(id, sucursales);
        }
    }

    onSucursalChange(index: number) {
        const group = this.facturas.at(index);
        const idSucursal = group.get('idSucursal')?.value;
        const idCliente = group.get('idCliente')?.value;
        if (idCliente && idSucursal) {
            const sucs = this.sucursalesPorCliente.get(idCliente) || [];
            const suc = sucs.find((s) => s.id === idSucursal);
            if (suc) {
                group.patchValue({
                    direccion: suc.direccion || '',
                    reglasRecepcion: suc.reglas ? JSON.stringify(suc.reglas) : '',
                });
            }
        }
    }

    getSucursales(clienteId: string): { label: string; value: string }[] {
        const sucs = this.sucursalesPorCliente.get(clienteId) || [];
        return sucs.map((s) => ({
            label: `${s.direccion}${s.puntoDeReferencia ? ` (${s.puntoDeReferencia})` : ''}`,
            value: s.id!,
        }));
    }

    getReglasDisplay(reglasJson: string): string {
        if (!reglasJson) return 'No especificadas';
        try {
            const r = JSON.parse(reglasJson);
            const partes: string[] = [];
            if (r.diasRecepcion?.length) {
                const dias: Record<string, string> = {
                    LUN: 'Lun',
                    MAR: 'Mar',
                    MIE: 'Mié',
                    JUE: 'Jue',
                    VIE: 'Vie',
                    SAB: 'Sáb',
                    DOM: 'Dom',
                };
                partes.push(`Días: ${r.diasRecepcion.map((d: string) => dias[d] || d).join(', ')}`);
            }
            if (r.horaEntrega) partes.push(`Hora: ${r.horaEntrega}`);
            if (r.requiereCita) partes.push('Requiere cita');
            if (r.instrucciones) partes.push(`Nota: ${r.instrucciones}`);
            return partes.join(' | ') || 'Sin reglas específicas';
        } catch {
            return reglasJson;
        }
    }

    hideDialog() {
        this.visible.set(false);
        this.submitted = false;
        this.errorMessage = '';
    }

    private formatDate(d: Date): string {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    save() {
        this.submitted = true;
        this.errorMessage = '';

        if (this.form.invalid) {
            this.errorMessage = 'Complete todos los campos obligatorios marcados con *.';
            return;
        }

        const raw = this.form.getRawValue();

        const chofer = this.choferes.find((ch) => ch.value === raw.idChofer);
        const vehiculo = this.vehiculos.find((v) => v.value === raw.idVehiculo);

        const fechaCreacion = this.guiaData().fechaCreacion || this.formatDate(new Date());

        const facturas: FacturaGuia[] = raw.facturas.map((f: any, i: number) => {
            const cliente = this.clientes.find((c) => c.id === f.idCliente);
            let reglas = undefined;
            if (f.reglasRecepcion) {
                try {
                    reglas = JSON.parse(f.reglasRecepcion);
                } catch {
                    reglas = undefined;
                }
            }
            return {
                id: this.guiaData().facturas?.[i]?.id || `fact-${Date.now()}-${i}`,
                numeroFactura: f.numeroFactura,
                idCliente: f.idCliente,
                nombreCliente: f.nombreCliente || cliente?.nombreComercial || '',
                rifCliente: f.rifCliente || '',
                telefono: f.telefono || cliente?.telefono || '',
                direccion: f.direccion || '',
                idSucursal: f.idSucursal || undefined,
                totalUSD: f.totalUSD,
                totalVES: f.totalVES,
                prioridad: f.prioridad || cliente?.prioridad || '',
                reglasRecepcion: reglas,
            };
        });

        const rawEmpresa = this.empresasOptions().find((e) => e.value === raw.empresa);

        const guiaFinal: GuiaDespacho = {
            ...this.guiaData(),
            empresa: raw.empresa,
            codigoGuia: raw.codigoGuia || undefined,
            numeroGuia: raw.codigoGuia || `G-${Date.now()}`,
            idChofer: raw.idChofer,
            nombreChofer: chofer?.nombreChofer || '',
            cedulaChofer: chofer?.cedulaChofer || '',
            idVehiculo: raw.idVehiculo,
            placaVehiculo: vehiculo?.placaVehiculo || '',
            camion: vehiculo?.camion || undefined,
            fechaCreacion,
            municipio: raw.municipio,
            estado: raw.estado,
            pdfFuente: raw.pdfFuente,
            observaciones: raw.observaciones || undefined,
            eventos: this.guiaData().id ? this.guiaData().eventos || [] : [],
            facturas,
        };

        this.onSave.emit(guiaFinal);
        this.visible.set(false);
    }
}

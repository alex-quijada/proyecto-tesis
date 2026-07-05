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
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, AbstractControl, Validators } from '@angular/forms';
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

import { GuiaDespacho, FacturaGuia } from '../data/rutas-mock';
import { CHOFERES_MOCK } from '../../choferes/data/choferes-mock';
import { VEHICULOS_MOCK } from '../../vehiculos/data/vehiculos-mock';
import { Cliente, SucursalCliente } from '../../clientes/clientes.types';
import { ClienteDialogComponent } from '../../clientes/components/cliente-dialog.component';
import Fuse from 'fuse.js';
import { PdfNormalizerService } from '../services/pdf-parse.service';
import { AuthService } from '@/app/auth/service/auth.service';
import { ClienteService } from '../../clientes/service/cliente.service';
import { VehiculoService } from '../../vehiculos/service/vehiculo.service';
import { RutaService } from '../services/ruta.service';

interface ChoferOption {
    label: string;
    value: string;
    nombreChofer: string;
    cedulaChofer: string;
}

interface AyudanteOption {
    label: string;
    value: string;
    nombreAyudante: string;
}

interface VehiculoOption {
    label: string;
    value: string;
    placaVehiculo: string;
    camion: string;
}

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
        ClienteDialogComponent,
    ],
    templateUrl: './guia-dialog.component.html',
})
export class GuiaDialogComponent {
    private fb = inject(FormBuilder);
    private pdfNormalizerService = inject(PdfNormalizerService);
    private authService = inject(AuthService);
    private clienteService = inject(ClienteService);
    private vehiculoService = inject(VehiculoService);
    private rutaService = inject(RutaService);

    @ViewChild('pdfInput') pdfInput!: ElementRef<HTMLInputElement>;

    visible = model<boolean>(false);
    guiaData = input<GuiaDespacho>({} as GuiaDespacho);
    userRole = input<string>('ADMIN');
    onSave = output<GuiaDespacho>();

    submitted = false;
    errorMessage = '';
    cargandoPDF = signal(false);
    clienteDialogVisible = signal(false);
    clientePendiente = signal<Cliente>({});
    clienteDialogFacturaIndex = signal(-1);
    currentRutaPdf = signal('');

    empresasOptions = signal<{ label: string; value: string }[]>([]);
    municipios = signal<{ label: string; value: string }[]>([]);

    choferesSig = signal<ChoferOption[]>(this.choferesFallback);
    ayudantesSig = signal<AyudanteOption[]>(this.ayudantesFallback);
    vehiculosSig = signal<VehiculoOption[]>(this.vehiculosFallback);
    clientesSig = signal<Cliente[]>(this.mockClientes);
    clientesOptionsSig = computed(() =>
        this.clientesSig().map((c) => ({
            label: c.nombreComercial || '',
            value: c.id || c.idCliente || '',
        })),
    );

    private get choferesFallback(): ChoferOption[] {
        return CHOFERES_MOCK.map((ch) => ({
            label: `${ch.nombreCompleto} (${ch.documentoIdentidad?.prefijo}-${ch.documentoIdentidad?.numero})`,
            value: ch.id!,
            nombreChofer: ch.nombreCompleto!,
            cedulaChofer: ch.documentoIdentidad
                ? `${ch.documentoIdentidad.prefijo}-${ch.documentoIdentidad.numero}`
                : '',
        }));
    }

    private get ayudantesFallback(): AyudanteOption[] {
        return CHOFERES_MOCK.filter((ch) => ch.rol === 'Ayudante').map((a) => ({
            label: `${a.nombreCompleto} (${a.documentoIdentidad?.prefijo}-${a.documentoIdentidad?.numero})`,
            value: a.id!,
            nombreAyudante: a.nombreCompleto!,
        }));
    }

    private get vehiculosFallback(): VehiculoOption[] {
        return VEHICULOS_MOCK.map((v) => ({
            label: `${v.placa} — ${v.marca} ${v.modelo} (${v.anio})`,
            value: v.id!,
            placaVehiculo: v.placa!,
            camion: `[${v.placa}] ${v.marca} ${v.modelo}`,
        }));
    }

    private get mockClientes(): Cliente[] {
        return [
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
    }

    sucursalesPorCliente = signal(new Map<string, SucursalCliente[]>());

    private fuseClientes: Fuse<Cliente>;

    form: FormGroup = this.fb.group({
        empresa: ['', Validators.required],
        codigoGuia: [''],
        idChofer: ['', Validators.required],
        idAyudante: [''],
        idVehiculo: ['', Validators.required],
        municipio: ['', Validators.required],
        pdfFuente: ['MANUAL'],
        observaciones: [''],
        facturas: this.fb.array([]),
    });

    get facturas(): FormArray {
        return this.form.get('facturas') as FormArray;
    }

    constructor() {
        this.fuseClientes = new Fuse(this.clientesSig(), {
            keys: ['nombreComercial'],
            threshold: 0.4,
            distance: 100,
            minMatchCharLength: 3,
        });

        effect(() => {
            const data = this.guiaData();
            this.submitted = false;
            this.errorMessage = '';

            if (data?.id) {
                this.form.patchValue({
                    empresa: data.empresa || '',
                    codigoGuia: data.codigoGuia || '',
                    idChofer: data.idChofer || '',
                    idAyudante: data.idAyudante || '',
                    idVehiculo: data.idVehiculo || '',
                    municipio: data.municipio || '',
                    pdfFuente: data.pdfFuente || 'MANUAL',
                    observaciones: data.observaciones || '',
                });
                this.setFacturas(data.facturas || []);
            } else {
                this.form.reset({
                    empresa: '',
                    codigoGuia: '',
                    idChofer: '',
                    idAyudante: '',
                    idVehiculo: '',
                    municipio: '',
                    pdfFuente: 'MANUAL',
                    observaciones: '',
                });
                this.facturas.clear();
            }
        });
    }

    async cargarDatos() {
        const [empresas, municipios] = await Promise.all([
            this.rutaService.obtenerEmpresas(),
            this.rutaService.obtenerMunicipios(),
        ]);
        this.empresasOptions.set(empresas);
        this.municipios.set(municipios);

        await Promise.all([this.cargarChoferes(), this.cargarVehiculos(), this.cargarClientes()]);
    }

    private async cargarChoferes() {
        try {
            const data = await this.authService.obtenerChoferes();
            if (data?.length) {
                const choferes = data
                    .filter((u) => u.rol === 'Chofer')
                    .map((u) => ({
                        label: `${u.nombreCompleto} (${u.documentoIdentidad?.prefijo}-${u.documentoIdentidad?.numero})`,
                        value: u.id!,
                        nombreChofer: u.nombreCompleto!,
                        cedulaChofer: u.documentoIdentidad
                            ? `${u.documentoIdentidad.prefijo}-${u.documentoIdentidad.numero}`
                            : '',
                    }));
                this.choferesSig.set(choferes);

                const ayudantes = data
                    .filter((u) => u.rol === 'Ayudante')
                    .map((u) => ({
                        label: `${u.nombreCompleto} (${u.documentoIdentidad?.prefijo}-${u.documentoIdentidad?.numero})`,
                        value: u.id!,
                        nombreAyudante: u.nombreCompleto!,
                    }));
                this.ayudantesSig.set(ayudantes);
            }
        } catch {
            /* keep fallback */
        }
    }

    private async cargarVehiculos() {
        try {
            const data = await this.vehiculoService.obtenerVehiculos();
            if (data?.length) {
                this.vehiculosSig.set(
                    data.map((v) => ({
                        label: `${v.placa} — ${v.marca} ${v.modelo} (${v.anio})`,
                        value: v.id_vehiculo || v.id || '',
                        placaVehiculo: v.placa || '',
                        camion: `[${v.placa}] ${v.marca} ${v.modelo}`,
                    })),
                );
            }
        } catch {
            /* keep fallback */
        }
    }

    private async cargarClientes() {
        try {
            const clientesData = await this.clienteService.obtenerClientes();
            if (clientesData?.length) {
                this.clientesSig.set(clientesData);
                this.fuseClientes = new Fuse(clientesData, {
                    keys: ['nombreComercial'],
                    threshold: 0.4,
                    distance: 100,
                    minMatchCharLength: 3,
                });
            }
        } catch {
            /* keep fallback */
        }
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

            this.currentRutaPdf.set(datos.ruta || '');

            this.form.patchValue({
                empresa: datos.empresa || '',
                codigoGuia: datos.codigoGuia || '',
                pdfFuente: 'PDF',
            });

            if (datos.chofer) {
                const match = this.choferesSig().find((ch) =>
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
                const match = this.vehiculosSig().find(
                    (v) => v.placaVehiculo.toLowerCase() === datos.placa.toLowerCase(),
                );
                if (match) {
                    this.form.patchValue({ idVehiculo: match.value });
                }
            }

            const pdfFacturas = (datos.facturas || []).map((f, i) => {
                const clienteMatch = this.matchClientePorFacturaPdf(f);
                const sucursalMatch = clienteMatch
                    ? this.matchSucursalPorRuta(clienteMatch, datos.ruta || '')
                    : undefined;
                return {
                    id: `fact-pdf-${i}`,
                    numeroFactura: f.numero || '',
                    idCliente: clienteMatch?.id || '',
                    nombreCliente: f.cliente || '',
                    rifCliente: clienteMatch?.documentoIdentidad
                        ? `${clienteMatch.documentoIdentidad.prefijo}-${clienteMatch.documentoIdentidad.numero}`
                        : '',
                    telefono: f.tlf || clienteMatch?.telefono || '',
                    direccion: sucursalMatch?.direccion || f.direccion || '',
                    totalUSD: f.totalUSD || 0,
                    totalVES: f.totalVES || 0,
                    prioridad: clienteMatch?.prioridad || '',
                    idSucursal: sucursalMatch?.id || '',
                };
            });
            this.setFacturas(pdfFacturas);
        } catch (error) {
            console.error('Error al procesar el PDF:', error);
            this.errorMessage = 'No se pudo procesar el archivo PDF.';
        } finally {
            this.cargandoPDF.set(false);
        }

        event.target.value = '';
    }

    private normalizarTel(tel: string): string {
        return tel.replace(/\D/g, '').replace(/^0+/, '');
    }

    private matchClientePorFacturaPdf(pdfFactura: {
        cliente: string;
        tlf: string;
    }): Cliente | null {
        const nombreLimpio = pdfFactura.cliente.replace(/^\d+\s*/g, '').trim();
        if (nombreLimpio) {
            const results = this.fuseClientes.search(nombreLimpio);
            if (results.length > 0 && results[0].score! < 0.4) {
                return results[0].item;
            }
        }

        const tlfPdf = this.normalizarTel(pdfFactura.tlf);
        if (tlfPdf && pdfFactura.tlf !== 'N/A') {
            for (const c of this.clientesSig()) {
                if (
                    c.telefono &&
                    (this.normalizarTel(c.telefono).includes(tlfPdf) ||
                        tlfPdf.includes(this.normalizarTel(c.telefono)))
                ) {
                    return c;
                }
                for (const s of c.sucursales || []) {
                    if (
                        s.telefonoContacto &&
                        (this.normalizarTel(s.telefonoContacto).includes(tlfPdf) ||
                            tlfPdf.includes(this.normalizarTel(s.telefonoContacto)))
                    ) {
                        return c;
                    }
                }
            }
        }

        return null;
    }

    private matchSucursalPorRuta(cliente: Cliente, rutaPdf: string): SucursalCliente | undefined {
        if (!rutaPdf) return undefined;
        return cliente.sucursales?.find(
            (s) => s.idMunicipio?.toUpperCase() === rutaPdf.toUpperCase(),
        );
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
            idEstado: [data?.idEstado || 'nuevo'],
        });

        if (data?.idCliente) {
            const cliente = this.clientesSig().find((c) => c.id === data.idCliente);
            if (cliente) {
                this.cargarSucursalesCliente(cliente.id!);
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

    async onClienteChange(index: number) {
        const group = this.facturas.at(index);
        const idCliente = group.get('idCliente')?.value;
        const cliente = this.clientesSig().find((c) => c.id === idCliente);
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
                reglasRecepcion: '',
            });
            await this.cargarSucursalesCliente(cliente.id!);
            this.autoSelectSucursalSiUnica(cliente.id!, group);
        }
    }

    private async cargarSucursalesCliente(clienteId: string) {
        if (!clienteId || this.sucursalesPorCliente().has(clienteId)) return;
        try {
            const data = await this.clienteService.obtenerSucursales(clienteId);
            const sucursales = data.map((s) => ({
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
            this.sucursalesPorCliente.set(new Map(this.sucursalesPorCliente()).set(clienteId, sucursales));
        } catch {
            /* ignore */
        }
    }

    private autoSelectSucursalSiUnica(clienteId: string, group: AbstractControl) {
        const sucs = this.sucursalesPorCliente().get(clienteId);
        if (sucs?.length === 1) {
            const suc = sucs[0];
            group.patchValue({
                idSucursal: suc.id,
                direccion: suc.direccion || '',
                telefono: suc.telefonoContacto || '',
                reglasRecepcion: suc.reglas ? JSON.stringify(suc.reglas) : '',
            });
        }
    }

    onSucursalChange(index: number) {
        const group = this.facturas.at(index);
        const idSucursal = group.get('idSucursal')?.value;
        const idCliente = group.get('idCliente')?.value;
        if (idCliente && idSucursal) {
            const sucs = this.sucursalesPorCliente().get(idCliente) || [];
            const suc = sucs.find((s) => s.id === idSucursal);
            if (suc) {
                group.patchValue({
                    direccion: suc.direccion || '',
                    telefono: suc.telefonoContacto || '',
                    reglasRecepcion: suc.reglas ? JSON.stringify(suc.reglas) : '',
                });
            }
        }
    }

    getSucursales(clienteId: string): { label: string; value: string }[] {
        const sucs = this.sucursalesPorCliente().get(clienteId) || [];
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

    abrirRegistroCliente(index: number) {
        const group = this.facturas.at(index);
        const nombre = group.get('nombreCliente')?.value || '';
        const telefono = group.get('telefono')?.value || '';
        const direccion = group.get('direccion')?.value || '';
        let idMunicipio = '';
        if (this.currentRutaPdf()) {
            const found = this.municipios().find(
                (m) => m.label.toUpperCase() === this.currentRutaPdf().toUpperCase(),
            );
            idMunicipio = found?.value || this.currentRutaPdf();
        }
        this.clientePendiente.set({
            nombreComercial: nombre,
            telefono,
            sucursales: [
                {
                    direccion: direccion || undefined,
                    telefonoContacto: telefono || undefined,
                    idMunicipio: idMunicipio || undefined,
                },
            ],
        });
        this.clienteDialogFacturaIndex.set(index);
        this.clienteDialogVisible.set(true);
    }

    async onClienteCreado(cliente: Cliente) {
        const id = cliente.id || cliente.idCliente;
        if (!id) return;
        const index = this.clienteDialogFacturaIndex();
        if (index >= 0 && index < this.facturas.length) {
            const group = this.facturas.at(index);
            group.patchValue({
                idCliente: id,
                nombreCliente: cliente.nombreComercial || '',
                rifCliente: cliente.documentoIdentidad
                    ? `${cliente.documentoIdentidad.prefijo}-${cliente.documentoIdentidad.numero}`
                    : '',
                telefono: cliente.telefono || '',
                prioridad: cliente.prioridad || '',
            });
            await this.cargarSucursalesCliente(id);
            this.autoSelectSucursalSiUnica(id, group);
        }
        this.clienteDialogFacturaIndex.set(-1);
        try {
            const clientesData = await this.clienteService.obtenerClientes();
            if (clientesData?.length) {
                this.clientesSig.set(clientesData);
                this.fuseClientes = new Fuse(clientesData, {
                    keys: ['nombreComercial'],
                    threshold: 0.4,
                    distance: 100,
                    minMatchCharLength: 3,
                });
            }
        } catch {
            /* ignore */
        }
    }

    save() {
        this.submitted = true;
        this.errorMessage = '';

        if (this.form.invalid) {
            this.errorMessage = 'Complete todos los campos obligatorios marcados con *.';
            return;
        }

        const raw = this.form.getRawValue();

        const chofer = this.choferesSig().find((ch) => ch.value === raw.idChofer);
        const ayudante = this.ayudantesSig().find((a) => a.value === raw.idAyudante);
        const vehiculo = this.vehiculosSig().find((v) => v.value === raw.idVehiculo);

        const fechaCreacion = this.guiaData().fechaCreacion || this.formatDate(new Date());

        const facturas: FacturaGuia[] = raw.facturas.map((f: any, i: number) => {
            const cliente = this.clientesSig().find((c) => c.id === f.idCliente);
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
                idEstado: f.idEstado || 'nuevo',
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
            idAyudante: raw.idAyudante || undefined,
            nombreAyudante: ayudante?.nombreAyudante || '',
            idVehiculo: raw.idVehiculo,
            placaVehiculo: vehiculo?.placaVehiculo || '',
            camion: vehiculo?.camion || undefined,
            fechaCreacion,
            municipio: raw.municipio,
            pdfFuente: raw.pdfFuente,
            observaciones: raw.observaciones || undefined,
            eventos: this.guiaData().id ? this.guiaData().eventos || [] : [],
            facturas,
        };

        this.onSave.emit(guiaFinal);
        this.visible.set(false);
    }
}

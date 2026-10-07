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
    OnInit,
    untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '@/app/services/notification.service';
import {
    ReactiveFormsModule,
    FormBuilder,
    FormGroup,
    FormArray,
    AbstractControl,
    Validators,
} from '@angular/forms';
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
import { TagModule } from 'primeng/tag';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';

import { GuiaDespacho, FacturaGuia } from '../data/rutas-mock';
import { Cliente, SucursalCliente } from '../../clientes/clientes.types';
import { ClienteDialogComponent } from '../../clientes/components/cliente-dialog.component';
import { Vehiculo } from '../../vehiculos/data/vehiculos-mock';
import { VehiculoDialogComponent } from '../../vehiculos/components/vehiculo-dialog/vehiculo-dialog.component';
import Fuse from 'fuse.js';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PdfNormalizerService, similitudTexto } from '../services/pdf-parse.service';
import { AuthService } from '@/app/auth/service/auth.service';
import { ClienteService } from '../../clientes/service/cliente.service';
import { VehiculoService } from '../../vehiculos/service/vehiculo.service';
import { RutaService } from '../services/ruta.service';

interface ChoferOption {
    label: string;
    value: string;
    nombreChofer: string;
    cedulaChofer: string;
    activo: boolean;
}

interface AyudanteOption {
    label: string;
    value: string;
    nombreAyudante: string;
    activo: boolean;
}

interface VehiculoOption {
    label: string;
    value: string;
    placaVehiculo: string;
    camion: string;
    estado: string;
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
        TagModule,
        FluidModule,
        MessageModule,
        TextareaModule,
        DividerModule,
        AccordionModule,
        TooltipModule,
        ProgressSpinnerModule,
        AutoCompleteModule,
        ClienteDialogComponent,
        VehiculoDialogComponent,
    ],
    templateUrl: './guia-dialog.component.html',
})
export class GuiaDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private pdfNormalizerService = inject(PdfNormalizerService);
    private authService = inject(AuthService);
    private clienteService = inject(ClienteService);
    private vehiculoService = inject(VehiculoService);
    private rutaService = inject(RutaService);
    private notif = inject(NotificationService);

    @ViewChild('pdfInput') pdfInput!: ElementRef<HTMLInputElement>;

    visible = model<boolean>(false);
    guiaData = input<GuiaDespacho>({} as GuiaDespacho);
    userRole = input<string>('ADMIN');
    onSave = output<GuiaDespacho>();

    submitted = false;
    errorMessage = signal('');
    codigoDuplicado = signal(false);
    private codigoCheckCounter = 0;
    cargandoPDF = signal(false);
    guardando = signal(false);
    clienteDialogVisible = signal(false);
    clientePendiente = signal<Cliente>({});
    clienteDialogFacturaIndex = signal(-1);
    vehiculoDialogVisible = signal(false);
    vehiculoPendiente = signal<Vehiculo>({});
    currentRutaPdf = signal('');

    empresasOptions = signal<{ label: string; value: string }[]>([]);
    municipios = signal<{ label: string; value: string }[]>([]);

    choferesSig = computed(() => this.todosLosChoferesSig().filter((c) => c.activo));
    todosLosChoferesSig = signal<ChoferOption[]>([]);
    ayudantesSig = computed(() => this.todosLosAyudantesSig().filter((a) => a.activo));
    todosLosAyudantesSig = signal<AyudanteOption[]>([]);
    vehiculosSig = signal<VehiculoOption[]>([]);
    vehiculosDisponiblesSig = computed(() =>
        this.vehiculosSig().filter((v) => v.estado === 'OPERATIVO'),
    );
    clientesSig = signal<Cliente[]>([]);
    clientesOptionsSig = computed(() =>
        this.clientesSig()
            .filter((c) => c.activo !== false)
            .map((c) => ({
                label: c.nombreComercial || '',
                value: c.id || c.idCliente || '',
            })),
    );
    filteredClientesSig = signal<{ label: string; value: string }[]>([]);

    entidadesInactivas = signal<string[]>([]);

    sucursalesPorCliente = signal<Record<string, SucursalCliente[]>>({});

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
            this.filteredClientesSig.set(this.clientesOptionsSig());
        });

        this.form.valueChanges
            .pipe(takeUntilDestroyed())
            .subscribe(() => this.actualizarEntidadesInactivas());

        this.form
            .get('codigoGuia')!
            .valueChanges.pipe(debounceTime(400), distinctUntilChanged(), takeUntilDestroyed())
            .subscribe((codigo: string) => {
                void this.verificarCodigoDuplicado(codigo);
            });

        effect(() => {
            const data = this.guiaData();

            untracked(() => {
                this.submitted = false;
                this.errorMessage.set('');
                this.codigoDuplicado.set(false);

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
                    this.addFactura();
                }
            });
        });

        effect(() => {
            const data = this.guiaData();
            const empresas = this.empresasOptions();

            untracked(() => {
                if (!data?.id || !empresas.length) return;
                const actual = this.form.get('empresa')?.value;
                if (!actual) return;
                if (empresas.some((e) => e.value === actual)) return;
                const match = empresas.find((e) => e.label.toUpperCase() === actual.toUpperCase());
                if (match) {
                    this.form.patchValue({ empresa: match.value });
                }
            });
        });
    }

    ngOnInit() {
        this.cargarDatos();
    }

    async cargarDatos() {
        const [empresas, municipios] = await Promise.all([
            this.rutaService.obtenerEmpresas(),
            this.rutaService.obtenerMunicipios(),
        ]);
        this.empresasOptions.set(empresas);
        this.municipios.set(municipios);

        await Promise.all([this.cargarChoferes(), this.cargarVehiculos(), this.cargarClientes()]);
        this.syncFacturasConClientes();
        this.actualizarEntidadesInactivas();
    }

    private syncFacturasConClientes() {
        for (let i = 0; i < this.facturas.length; i++) {
            const group = this.facturas.at(i);
            const idCliente = this.obtenerIdCliente(group.get('idCliente')?.value);
            if (idCliente) {
                const cliente = this.clientesSig().find((c) => c.id === idCliente);
                if (cliente) {
                    group.patchValue({
                        nombreCliente: cliente.personaContacto || '',
                        rifCliente: cliente.documentoIdentidad
                            ? `${cliente.documentoIdentidad.prefijo}-${cliente.documentoIdentidad.numero}`
                            : '',
                        telefono: cliente.telefono || '',
                        prioridad: cliente.prioridad || '',
                        idCliente: { label: cliente.nombreComercial || '', value: idCliente },
                    });
                    this.cargarSucursalesCliente(idCliente);
                    this.autoSelectSucursalSiUnica(idCliente, group);
                }
            }
        }
    }

    private async cargarChoferes() {
        try {
            const data = await this.authService.obtenerChoferes(true);
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
                        activo: u.activo !== false,
                    }));
                this.todosLosChoferesSig.set(choferes);

                const ayudantes = data
                    .filter((u) => u.rol === 'Ayudante')
                    .map((u) => ({
                        label: `${u.nombreCompleto} (${u.documentoIdentidad?.prefijo}-${u.documentoIdentidad?.numero})`,
                        value: u.id!,
                        nombreAyudante: u.nombreCompleto!,
                        activo: u.activo !== false,
                    }));
                this.todosLosAyudantesSig.set(ayudantes);
            }
        } catch (err) {
            console.warn('[GuiaDialog] Error al cargar ayudantes, manteniendo fallback:', err);
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
                        estado: (v.estado || '').toUpperCase(),
                    })),
                );
            }
        } catch (err) {
            console.warn('[GuiaDialog] Error al cargar vehículos, manteniendo fallback:', err);
        }
    }

    private async cargarClientes() {
        try {
            const clientesData = await this.clienteService.obtenerClientes();
            if (clientesData?.length) {
                this.clientesSig.set(clientesData);
                this.filteredClientesSig.set(this.clientesOptionsSig());
                this.fuseClientes.setCollection(clientesData);
            }
        } catch (err) {
            console.warn('[GuiaDialog] Error al cargar clientes, manteniendo fallback:', err);
        }
    }

    private actualizarEntidadesInactivas() {
        const msgs: string[] = [];
        const raw = this.form.getRawValue();

        if (raw.idChofer) {
            const c = this.todosLosChoferesSig().find((x) => x.value === raw.idChofer);
            if (c && !c.activo) msgs.push(`El chofer ${c.nombreChofer} está inactivo`);
        }
        if (raw.idAyudante) {
            const a = this.todosLosAyudantesSig().find((x) => x.value === raw.idAyudante);
            if (a && !a.activo) msgs.push(`El ayudante ${a.nombreAyudante} está inactivo`);
        }
        if (raw.idVehiculo) {
            const v = this.vehiculosSig().find((x) => x.value === raw.idVehiculo);
            if (v && v.estado !== 'OPERATIVO') {
                const detalle =
                    v.estado === 'MANTENIMIENTO' ? 'está en mantenimiento' : 'está inactivo';
                msgs.push(`El vehículo ${v.placaVehiculo} ${detalle}`);
            }
        }

        (raw.facturas || []).forEach((f: any, i: number) => {
            const idCliente = this.obtenerIdCliente(f.idCliente);
            if (!idCliente) return;
            const cliente = this.clientesSig().find((c) => (c.id || c.idCliente) === idCliente);
            if (cliente && cliente.activo === false) {
                msgs.push(
                    `El cliente ${cliente.nombreComercial} está inactivo (Factura #${i + 1})`,
                );
            }
        });

        this.entidadesInactivas.set(msgs);
    }

    private async verificarCodigoDuplicado(codigo: string) {
        const token = ++this.codigoCheckCounter;
        const norm = (codigo || '').trim().toLowerCase();
        if (!norm) {
            if (token === this.codigoCheckCounter) this.codigoDuplicado.set(false);
            return;
        }
        try {
            const existe = await this.rutaService.existeCodigoGuia(norm, this.guiaData()?.id);
            if (token === this.codigoCheckCounter) this.codigoDuplicado.set(existe);
        } catch (err) {
            console.warn('[GuiaDialog] Error al verificar código de guía duplicado:', err);
            if (token === this.codigoCheckCounter) this.codigoDuplicado.set(false);
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
            // console.log('Datos extraídos del PDF:', datos);

            this.currentRutaPdf.set(datos.ruta || '');

            if (datos.codigoGuia) {
                const yaExiste = await this.rutaService.existeCodigoGuia(
                    datos.codigoGuia,
                    this.guiaData()?.id,
                );
                if (yaExiste) {
                    this.codigoDuplicado.set(true);
                    this.notif.add({
                        severity: 'warn',
                        summary: 'Guía duplicada',
                        detail: `El código ${datos.codigoGuia} ya existe en el sistema. Revisa antes de guardar.`,
                        life: 6000,
                    });
                }
            }

            if (datos.empresa) {
                const opciones = this.empresasOptions();
                let empresaMatch: { label: string; value: string } | undefined;
                let mejorScore = 0;
                for (const e of opciones) {
                    const score = similitudTexto(e.label, datos.empresa);
                    if (score > mejorScore) {
                        mejorScore = score;
                        empresaMatch = e;
                    }
                }
                if (empresaMatch && mejorScore >= 0.6) {
                    this.form.patchValue({
                        empresa: empresaMatch.value,
                        codigoGuia: datos.codigoGuia || '',
                        pdfFuente: 'PDF',
                    });
                } else {
                    this.form.patchValue({
                        empresa: datos.empresa || '',
                        codigoGuia: datos.codigoGuia || '',
                        pdfFuente: 'PDF',
                    });
                }
            } else {
                this.form.patchValue({
                    codigoGuia: datos.codigoGuia || '',
                    pdfFuente: 'PDF',
                });
            }

            if (datos.ruta) {
                const municipioMatch = this.municipios().find(
                    (m) =>
                        m.label.localeCompare(datos.ruta!, undefined, { sensitivity: 'base' }) ===
                        0,
                );
                if (municipioMatch) {
                    this.form.patchValue({ municipio: municipioMatch.value });
                }
            }

            if (datos.chofer) {
                const match = this.todosLosChoferesSig().find((ch) =>
                    ch.nombreChofer
                        .toLowerCase()
                        .includes(
                            datos.chofer.toLowerCase().split(']')[1]?.trim() ||
                                datos.chofer.toLowerCase(),
                        ),
                );
                if (match) {
                    if (!match.activo) {
                        this.notif.add({
                            severity: 'warn',
                            summary: 'Chofer inactivo',
                            detail: `El chofer ${match.nombreChofer} está inactivo. Selecciona otro.`,
                            life: 5000,
                        });
                    } else {
                        this.form.patchValue({ idChofer: match.value });
                    }
                } else {
                    this.notif.add({
                        severity: 'warn',
                        summary: 'Chofer no registrado',
                        detail: `El chofer "${datos.chofer}" no está registrado en el sistema. Contacta al administrador para registrarlo.`,
                        life: 6000,
                    });
                }
            }

            if (datos.placa) {
                const match = this.vehiculosSig().find(
                    (v) => v.placaVehiculo.toLowerCase() === datos.placa.toLowerCase(),
                );
                if (match) {
                    if (match.estado !== 'OPERATIVO') {
                        const detalle =
                            match.estado === 'MANTENIMIENTO'
                                ? 'está en mantenimiento'
                                : 'está inactivo';
                        this.notif.add({
                            severity: 'warn',
                            summary: 'Vehículo no disponible',
                            detail: `El vehículo ${match.placaVehiculo} ${detalle}. Selecciona uno operativo.`,
                            life: 5000,
                        });
                    } else {
                        this.form.patchValue({ idVehiculo: match.value });
                    }
                } else {
                    this.notif.add({
                        severity: 'warn',
                        summary: 'Vehículo no registrado',
                        detail: `El vehículo con placa ${datos.placa} no está registrado. Abriendo el formulario para registrarlo...`,
                        life: 6000,
                    });
                    // El camión viene como "[PLACA] MARCA MODELO - peso kg".
                    // Se derivan marca y modelo (primera palabra = marca, resto = modelo).
                    const desc = (datos.camion || '')
                        .replace(/^\[[^\]]*\]\s*/, '')
                        .replace(/\s*-\s*[\d.,]+\s*kg$/i, '')
                        .trim();
                    const partes = desc.split(/\s+/);
                    const marca = partes[0] || '';
                    const modelo = partes.slice(1).join(' ') || '';
                    this.vehiculoPendiente.set({
                        placa: datos.placa.toUpperCase(),
                        marca: marca.toUpperCase(),
                        modelo: modelo.toUpperCase(),
                        pesoMaximo: datos.pesoLimite || 0,
                    } as Vehiculo);
                    this.vehiculoDialogVisible.set(true);
                }
            }

            const pdfFacturas = (datos.facturas || []).map((f, i) => {
                const clienteMatch = this.matchClientePorFacturaPdf(f);
                if (clienteMatch && clienteMatch.activo === false) {
                    this.notif.add({
                        severity: 'warn',
                        summary: 'Cliente inactivo',
                        detail: `El cliente ${clienteMatch.nombreComercial} está inactivo (Factura #${
                            i + 1
                        }). Selecciona otro cliente.`,
                        life: 5000,
                    });
                }
                const sucursalMatch = clienteMatch
                    ? this.matchSucursalPorRuta(clienteMatch, datos.ruta || '')
                    : undefined;
                return {
                    id: `fact-pdf-${i}`,
                    numeroFactura: f.numero || '',
                    idCliente: clienteMatch?.activo === false ? '' : clienteMatch?.id || '',
                    nombreCliente: clienteMatch
                        ? clienteMatch.personaContacto || clienteMatch.nombreComercial || ''
                        : f.cliente || '',
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
            this.errorMessage.set('No se pudo procesar el archivo PDF.');
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
            // Plan A: Fuse.js por nombre.
            const results = this.fuseClientes.search(nombreLimpio);
            if (results.length > 0 && results[0].score! < 0.4) {
                return results[0].item;
            }

            // Plan B: similitudTexto (normaliza acentos/puntuación/razón social),
            // mismo criterio que se usa para las empresas.
            let mejor: Cliente | null = null;
            let mejorScore = 0;
            for (const c of this.clientesSig()) {
                const score = similitudTexto(c.nombreComercial || '', nombreLimpio);
                if (score > mejorScore) {
                    mejorScore = score;
                    mejor = c;
                }
            }
            if (mejor && mejorScore >= 0.6) {
                return mejor;
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
            idCliente: [
                data?.idCliente ? this.optionCliente(data.idCliente) : '',
                Validators.required,
            ],
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
                this.cargarSucursalesCliente(cliente.id!).then(() => {
                    if (data.idSucursal) {
                        this.aplicarSucursal(group, cliente.id!, data.idSucursal);
                    }
                });
                group.patchValue({
                    idCliente: { label: cliente.nombreComercial || '', value: cliente.id || '' },
                    nombreCliente: cliente.personaContacto || '',
                    rifCliente: cliente.documentoIdentidad
                        ? `${cliente.documentoIdentidad.prefijo}-${cliente.documentoIdentidad.numero}`
                        : '',
                    telefono: cliente.telefono || '',
                    prioridad: cliente.prioridad || '',
                });
            }
        }

        return group;
    }

    private aplicarSucursal(group: AbstractControl, idCliente: string, idSucursal: string) {
        const suc = this.sucursalesPorCliente()[idCliente]?.find((s) => s.id === idSucursal);
        if (!suc) return;
        group.patchValue({
            direccion: suc.direccion || '',
            telefono: suc.telefonoContacto || '',
            reglasRecepcion: suc.reglas ? JSON.stringify(suc.reglas) : '',
        });
    }

    addFactura() {
        this.resetFilteredClientes();
        this.facturas.push(this.createFacturaGroup());
    }

    removeFactura(index: number) {
        this.facturas.removeAt(index);
    }

    private resetFilteredClientes() {
        this.filteredClientesSig.set(this.clientesOptionsSig());
    }

    obtenerIdCliente(raw: any): string {
        if (typeof raw === 'object' && raw !== null) {
            return raw.value ?? '';
        }
        if (typeof raw === 'string' && raw) {
            const existe = this.clientesSig().some((c) => c.id === raw || c.idCliente === raw);
            return existe ? raw : '';
        }
        return '';
    }

    private optionCliente(id: string): { label: string; value: string } | string {
        const c = this.clientesSig().find((c) => c.id === id);
        return c ? { label: c.nombreComercial || '', value: c.id || '' } : id;
    }

    filterClientes(event: AutoCompleteCompleteEvent) {
        const query = (event.query || '').toLowerCase().trim();
        queueMicrotask(() => {
            this.filteredClientesSig.set(
                query
                    ? this.clientesOptionsSig().filter((c) => c.label.toLowerCase().includes(query))
                    : [...this.clientesOptionsSig()],
            );
        });
    }

    async onClienteChange(index: number) {
        const group = this.facturas.at(index);
        const idCliente = this.obtenerIdCliente(group.get('idCliente')?.value);
        const cliente = this.clientesSig().find((c) => c.id === idCliente);
        if (cliente) {
            group.patchValue({
                nombreCliente: cliente.personaContacto || '',
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
        if (!clienteId || this.sucursalesPorCliente()[clienteId]) return;
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
            this.sucursalesPorCliente.update((prev) => ({
                ...prev,
                [clienteId]: sucursales,
            }));
        } catch (err) {
            console.warn(
                `[GuiaDialog] Error al cargar sucursales para el cliente ${clienteId}:`,
                err,
            );
        }
    }

    private autoSelectSucursalSiUnica(clienteId: string, group: AbstractControl) {
        const sucs = this.sucursalesPorCliente()[clienteId];
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
        const idCliente = this.obtenerIdCliente(group.get('idCliente')?.value);
        if (idCliente && idSucursal) {
            const sucs = this.sucursalesPorCliente()[idCliente] || [];
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
        const sucs = this.sucursalesPorCliente()[clienteId] || [];
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
            if (r.horaDesde && r.horaHasta) partes.push(`Horario: ${r.horaDesde} - ${r.horaHasta}`);
            else if (r.horaDesde) partes.push(`Desde: ${r.horaDesde}`);
            else if (r.horaHasta) partes.push(`Hasta: ${r.horaHasta}`);
            if (r.requiereCita) partes.push('Requiere cita');
            if (r.instrucciones) partes.push(`Nota: ${r.instrucciones}`);
            return partes.join(' | ') || 'Sin reglas específicas';
        } catch {
            return 'No especificadas';
        }
    }

    seleccionarTexto(event: any) {
        const input =
            (event?.target as HTMLInputElement) || (event?.currentTarget as HTMLInputElement);
        if (input && typeof input.select === 'function') {
            setTimeout(() => input.select(), 0);
        }
    }

    getPrioridadSeverity(
        prioridad: string | null | undefined,
    ): 'danger' | 'warn' | 'info' | 'secondary' {
        if (!prioridad) return 'secondary';
        const p = prioridad.toLowerCase();
        if (p.includes('alta')) return 'danger';
        if (p.includes('media')) return 'warn';
        if (p.includes('baja') || p.includes('normal')) return 'info';
        return 'secondary';
    }

    esFacturaDuplicada(index: number): boolean {
        const num = (this.facturas.at(index)?.get('numeroFactura')?.value || '')
            .trim()
            .toUpperCase();
        if (!num) return false;
        let count = 0;
        for (let i = 0; i < this.facturas.length; i++) {
            const otroNum = (this.facturas.at(i)?.get('numeroFactura')?.value || '')
                .trim()
                .toUpperCase();
            if (otroNum === num) count++;
        }
        return count > 1;
    }

    hideDialog() {
        this.visible.set(false);
        this.submitted = false;
        this.errorMessage.set('');
    }

    private formatDate(d: Date): string {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    abrirRegistroCliente(index: number) {
        const group = this.facturas.at(index);
        const valorIdCliente = group.get('idCliente')?.value;
        const nombreDesdeInput =
            typeof valorIdCliente === 'string' ? valorIdCliente : valorIdCliente?.label || '';
        const nombre = group.get('nombreCliente')?.value || nombreDesdeInput || '';
        const telefono = group.get('telefono')?.value || '';
        const direccion = group.get('direccion')?.value || '';
        let idMunicipio = '';
        if (this.currentRutaPdf()) {
            const found = this.municipios().find(
                (m) =>
                    m.label.localeCompare(this.currentRutaPdf(), undefined, {
                        sensitivity: 'base',
                    }) === 0,
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
                idCliente: { label: cliente.nombreComercial || '', value: id },
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
                this.filteredClientesSig.set(this.clientesOptionsSig());
                this.fuseClientes.setCollection(clientesData);
            }
        } catch {
            /* ignore */
        }
    }

    async onVehiculoCreado(vehiculo: Vehiculo) {
        await this.cargarVehiculos();
        const match = this.vehiculosSig().find(
            (v) => v.placaVehiculo.toLowerCase() === (vehiculo.placa || '').toLowerCase(),
        );
        if (match) {
            this.form.patchValue({ idVehiculo: match.value });
        }
    }

    async save() {
        this.submitted = true;
        this.errorMessage.set('');
        this.form.markAllAsTouched();

        if (this.guiaData()?.id) {
            const facturasActuales = this.guiaData().facturas || [];
            const estados = facturasActuales.map((f) => f.idEstado?.toLowerCase() || 'nuevo');
            const enTransito = estados.some(
                (e) => e === 'proceso' || e === 'espera' || e === 'entrega',
            );
            if (enTransito) {
                this.errorMessage.set(
                    'No se puede modificar la guía mientras el viaje esté en curso.',
                );
                return;
            }
            const todasIniciales = estados.every((e) => e === 'nuevo' || e === 'embarque');
            const tieneIncidencia = estados.some((e) => e === 'incidencia');
            if (!todasIniciales && !tieneIncidencia) {
                this.errorMessage.set(
                    'No se puede modificar la guía porque ya ha sido finalizada o cancelada.',
                );
                return;
            }
        }

        this.actualizarEntidadesInactivas();
        if (this.entidadesInactivas().length) {
            this.errorMessage.set(
                this.entidadesInactivas().join(' ') +
                    ' Corrige la selección antes de guardar la guía.',
            );
            return;
        }

        if (this.facturas.length === 0) {
            this.errorMessage.set('Debe registrar al menos una factura en la guía de despacho.');
            return;
        }

        if (this.form.invalid) {
            this.errorMessage.set('Complete todos los campos obligatorios marcados con *.');
            return;
        }

        const raw = this.form.getRawValue();

        // Validar que no existan números de factura repetidos dentro de la misma guía
        const facturasNums = (raw.facturas || [])
            .map((f: any) => (f.numeroFactura || '').trim().toUpperCase())
            .filter((n: string) => !!n);
        const setNums = new Set<string>();
        const repetidos: string[] = [];
        for (const num of facturasNums) {
            if (setNums.has(num)) {
                repetidos.push(num);
            } else {
                setNums.add(num);
            }
        }
        if (repetidos.length > 0) {
            this.errorMessage.set(
                `El número de factura "${repetidos[0]}" está duplicado en esta guía. Cada factura debe tener un número único.`,
            );
            return;
        }

        const codigoNorm = (raw.codigoGuia || '').trim().toLowerCase();
        if (codigoNorm) {
            const yaExiste = await this.rutaService.existeCodigoGuia(
                codigoNorm,
                this.guiaData()?.id,
            );
            if (yaExiste) {
                this.codigoDuplicado.set(true);
                this.errorMessage.set(
                    'El código de guía ya existe en el sistema. Verifica el número antes de guardar.',
                );
                return;
            }
        }

        const chofer = this.choferesSig().find((ch) => ch.value === raw.idChofer);
        const ayudante = this.ayudantesSig().find((a) => a.value === raw.idAyudante);
        const vehiculo = this.vehiculosSig().find((v) => v.value === raw.idVehiculo);

        const fechaCreacion = this.guiaData().fechaCreacion || this.formatDate(new Date());

        const facturas: FacturaGuia[] = raw.facturas.map((f: any, i: number) => {
            const fIdCliente = this.obtenerIdCliente(f.idCliente);
            const cliente = this.clientesSig().find((c) => c.id === fIdCliente);
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
                idCliente: fIdCliente,
                nombreCliente: f.nombreCliente || cliente?.personaContacto || '',
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
            empresa: rawEmpresa?.label || raw.empresa,
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

        try {
            this.guardando.set(true);
            const esEdicion = !!this.guiaData().id;
            const guardada = esEdicion
                ? await this.rutaService.actualizarGuia(guiaFinal)
                : await this.rutaService.crearGuia(guiaFinal);

            this.onSave.emit(guardada);
            this.visible.set(false);
        } catch (error: any) {
            console.error('Error al guardar guía:', error);
            this.errorMessage.set(
                error?.message || 'Error al guardar la guía en la base de datos.',
            );
        } finally {
            this.guardando.set(false);
        }
    }
}

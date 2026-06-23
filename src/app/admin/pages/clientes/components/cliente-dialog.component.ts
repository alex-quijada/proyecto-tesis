import { Component, input, output, model, effect, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { FluidModule } from 'primeng/fluid';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { InputMaskModule } from 'primeng/inputmask';
import { DatePickerModule } from 'primeng/datepicker';
import { DividerModule } from 'primeng/divider';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectButtonModule } from 'primeng/selectbutton';

import { Cliente, SucursalCliente } from '../clientes.types';
import { DIAS_RECEPCION, OPCIONES_CITA } from '../clientes.constants';
import {
    ClienteService,
    PrefijoItem,
    MunicipioItem,
    PrioridadItem,
} from '../service/cliente.service';
import { MapaSucursalComponent } from './mapa-sucursal.component';

@Component({
    selector: 'app-cliente-dialog',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        DialogModule,
        ButtonModule,
        InputTextModule,
        SelectModule,
        FluidModule,
        MessageModule,
        TextareaModule,
        InputMaskModule,
        DatePickerModule,
        DividerModule,
        MultiSelectModule,
        SelectButtonModule,
        MapaSucursalComponent,
    ],
    templateUrl: './cliente-dialog.component.html',
})
export class ClienteDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private clienteService = inject(ClienteService);

    visible = model<boolean>(false);
    clienteData = input<Cliente>({});
    onSave = output<Cliente>();

    submitted = false;
    saving = false;
    errorMessage = '';

    prefijos = signal<PrefijoItem[]>([]);
    municipios = signal<MunicipioItem[]>([]);
    prioridades = signal<PrioridadItem[]>([]);
    diasSemana = DIAS_RECEPCION;
    opcionesCita = OPCIONES_CITA;

    form: FormGroup = this.fb.group({
        idPrefijo: ['', Validators.required],
        rif: [
            '12345678',
            [
                Validators.required,
                Validators.pattern(/^\d+$/),
                Validators.minLength(5),
                Validators.maxLength(12),
            ],
        ],
        nombreComercial: ['Cliente de Prueba, C.A.', Validators.required],
        telefono: ['0414-1234567', [Validators.pattern(/^(\+?\d{1,3}[-.\s]?)?\d{7,12}$/)]],
        correo: ['test@correo.com', [Validators.email]],
        personaContacto: ['Juan Pérez'],
        idPrioridad: ['', Validators.required],
        sucursales: this.fb.array([]),
    });

    async ngOnInit() {
        try {
            const [prefijos, municipios, prioridades] = await Promise.all([
                this.clienteService.obtenerPrefijos(),
                this.clienteService.obtenerMunicipios(),
                this.clienteService.obtenerPrioridades(),
            ]);
            this.prefijos.set(prefijos);
            this.municipios.set(municipios);
            this.prioridades.set(prioridades);

            if (prefijos.length && !this.form.get('idPrefijo')?.value) {
                this.form.patchValue({ idPrefijo: prefijos[0].id_prefijo });
            }
            if (prioridades.length) {
                const media = prioridades.find((p) => p.nombre_prioridad === 'media');
                if (media && !this.form.get('idPrioridad')?.value) {
                    this.form.patchValue({ idPrioridad: media.id_prioridad });
                }
            }
        } catch (e) {
            console.error('Error loading catalog data:', e);
        }
    }

    constructor() {
        effect(() => {
            const data = this.clienteData();
            this.submitted = false;
            this.errorMessage = '';

            this.form.markAsPristine();
            this.form.markAsUntouched();

            this.form.patchValue({
                idPrefijo: data.idPrefijo || '',
                rif: data.documentoIdentidad?.numero || '',
                nombreComercial: data.nombreComercial || '',
                telefono: data.telefono || '',
                correo: data.correo || '',
                personaContacto: data.personaContacto || '',
                idPrioridad: data.idPrioridad || '',
            });

            this.sucursalesForm.clear();
            const sucs: SucursalCliente[] = data.sucursales?.length
                ? data.sucursales
                : [
                      {
                          direccion: '',
                          puntoDeReferencia: '',
                          idMunicipio: '',
                          reglas: {
                              diasRecepcion: [],
                              requiereCita: false,
                              instrucciones: '',
                          },
                      } as SucursalCliente,
                  ];

            for (const s of sucs) {
                this.sucursalesForm.push(this.crearSucursalGroup(s));
            }
        });
    }

    get sucursalesForm(): FormArray {
        return this.form.get('sucursales') as FormArray;
    }

    private crearSucursalGroup(s: SucursalCliente = {}): FormGroup {
        return this.fb.group({
            idMunicipio: [s.idMunicipio || '', Validators.required],
            direccion: [s.direccion || '', Validators.required],
            puntoDeReferencia: [s.puntoDeReferencia || ''],
            latitud: [s.latitud ?? null],
            longitud: [s.longitud ?? null],
            reglas: this.fb.group({
                horaEntrega: [
                    s.reglas?.horaEntrega
                        ? this.horaStringToDate(s.reglas.horaEntrega)
                        : null,
                ],
                diasRecepcion: [s.reglas?.diasRecepcion || []],
                requiereCita: [s.reglas?.requiereCita ?? false],
                instrucciones: [s.reglas?.instrucciones || ''],
            }),
            nombreContacto: [s.nombreContacto || ''],
            telefonoContacto: [s.telefonoContacto || ''],
        });
    }

    private horaStringToDate(time: string): Date | null {
        if (!time) return null;
        const [h, m] = time.split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return null;
        const d = new Date();
        d.setHours(h, m, 0, 0);
        return d;
    }

    private horaDateToString(d: Date | null | undefined): string {
        if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    agregarSucursal() {
        this.sucursalesForm.push(this.crearSucursalGroup());
    }

    eliminarSucursal(index: number) {
        this.sucursalesForm.removeAt(index);
    }

    hideDialog() {
        this.visible.set(false);
        this.submitted = false;
        this.errorMessage = '';
        this.form.markAsPristine();
        this.form.markAsUntouched();
    }

    obtenerNombreMunicipio(idMunicipio: string): string {
        return this.municipios().find((m) => m.id_municipio === idMunicipio)?.nombre || '';
    }

    async save() {
        this.submitted = true;
        this.errorMessage = '';

        if (this.saving) return;
        if (this.form.invalid) {
            this.errorMessage = 'Complete todos los campos obligatorios marcados con *.';
            return;
        }
        this.saving = true;

        const raw = this.form.getRawValue();
        const prioridadLabel =
            this.prioridades().find((p) => p.id_prioridad === raw.idPrioridad)?.nombre_prioridad ||
            '';

        const clienteFinal: Cliente = {
            ...this.clienteData(),
            idPrefijo: raw.idPrefijo,
            documentoIdentidad: {
                prefijo:
                    this.prefijos().find((p) => p.id_prefijo === raw.idPrefijo)?.prefijo || 'V',
                numero: raw.rif,
            },
            nombreComercial: raw.nombreComercial,
            telefono: raw.telefono,
            correo: raw.correo,
            personaContacto: raw.personaContacto,
            idPrioridad: raw.idPrioridad,
            prioridad: prioridadLabel,
            sucursales: raw.sucursales
                .filter((s: any) => s.direccion?.trim())
                .map((s: any) => ({
                    idMunicipio: s.idMunicipio,
                    direccion: s.direccion,
                    puntoDeReferencia: s.puntoDeReferencia,
                    latitud: s.latitud ? Number(s.latitud) : undefined,
                    longitud: s.longitud ? Number(s.longitud) : undefined,
                    nombreContacto: s.nombreContacto,
                    telefonoContacto: s.telefonoContacto,
                    reglas: {
                        horaEntrega: this.horaDateToString(s.reglas.horaEntrega),
                        diasRecepcion: s.reglas.diasRecepcion,
                        requiereCita: s.reglas.requiereCita,
                        instrucciones: s.reglas.instrucciones,
                    },
                })),
        };

        try {
            const clienteId = await this.clienteService.crearCliente(clienteFinal);
            await this.clienteService.guardarSucursales(clienteId, clienteFinal.sucursales || []);
            clienteFinal.id = clienteId;
            clienteFinal.idCliente = clienteId;
            this.onSave.emit(clienteFinal);
            this.visible.set(false);
            this.saving = false;
        } catch (e: any) {
            this.errorMessage = e.message || 'Error al guardar el cliente';
            this.saving = false;
        }
    }
}

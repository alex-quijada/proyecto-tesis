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
import { DividerModule } from 'primeng/divider';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectButtonModule } from 'primeng/selectbutton';
import { InputNumberModule } from 'primeng/inputnumber';

import {
    Cliente,
    DocumentoIdentidad,
    UbicacionResumen,
} from '../clientes.types';
import {
    DIAS_RECEPCION,
    OPCIONES_CITA,
} from '../clientes.constants';
import {
    ClienteService,
    PrefijoItem,
    MunicipioItem,
    PrioridadItem,
} from '../service/cliente.service';

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
        DividerModule,
        MultiSelectModule,
        SelectButtonModule,
        InputNumberModule,
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
    errorMessage = '';

    prefijos = signal<PrefijoItem[]>([]);
    municipios = signal<MunicipioItem[]>([]);
    prioridades = signal<PrioridadItem[]>([]);
    diasSemana = DIAS_RECEPCION;
    opcionesCita = OPCIONES_CITA;

    form: FormGroup = this.fb.group({
        idPrefijo: ['', Validators.required],
        rif: [
            '',
            [
                Validators.required,
                Validators.pattern(/^\d+$/),
                Validators.minLength(5),
                Validators.maxLength(12),
            ],
        ],
        nombreComercial: ['', Validators.required],
        telefono: ['', [Validators.pattern(/^(\+?\d{1,3}[-.\s]?)?\d{7,12}$/)]],
        correo: ['', [Validators.email]],
        personaContacto: [''],
        idPrioridad: ['', Validators.required],
        ubicaciones: this.fb.array([]),
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
                const media = prioridades.find((p) => p.nombre_prioridad === 'Media');
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

            this.form.patchValue({
                idPrefijo: data.idPrefijo || '',
                rif: data.documentoIdentidad?.numero || '',
                nombreComercial: data.nombreComercial || '',
                telefono: data.telefono || '',
                correo: data.correo || '',
                personaContacto: data.personaContacto || '',
                idPrioridad: data.idPrioridad || '',
            });

            this.ubicacionesForm.clear();
            const ubs: UbicacionResumen[] = data.ubicaciones?.length
                ? data.ubicaciones
                : [
                      {
                          idMunicipio: '',
                          municipio: '',
                          direccion: '',
                          referencia: '',
                          pais: 'Venezuela',
                          estado: 'Nueva Esparta',
                          reglas: {
                              horarioDesde: '',
                              horarioHasta: '',
                              diasRecepcion: [],
                              requiereCita: false,
                              instrucciones: '',
                          },
                      },
                  ];

            for (const ub of ubs) {
                this.ubicacionesForm.push(this.crearUbicacionGroup(ub));
            }
        });
    }

    get ubicacionesForm(): FormArray {
        return this.form.get('ubicaciones') as FormArray;
    }

    private crearUbicacionGroup(ub: UbicacionResumen = {}): FormGroup {
        return this.fb.group({
            idMunicipio: [ub.idMunicipio || '', Validators.required],
            direccion: [ub.direccion || '', Validators.required],
            referencia: [ub.referencia || ''],
            pais: [{ value: ub.pais || 'Venezuela', disabled: true }],
            estado: [{ value: ub.estado || 'Nueva Esparta', disabled: true }],
            reglas: this.fb.group({
                horarioDesde: [ub.reglas?.horarioDesde || ''],
                horarioHasta: [ub.reglas?.horarioHasta || ''],
                diasRecepcion: [ub.reglas?.diasRecepcion || []],
                requiereCita: [ub.reglas?.requiereCita ?? false],
                instrucciones: [ub.reglas?.instrucciones || ''],
            }),
            nombreContacto: [ub.nombreContacto || ''],
            telefonoContacto: [ub.telefonoContacto || ''],
        });
    }

    agregarUbicacion() {
        this.ubicacionesForm.push(this.crearUbicacionGroup());
    }

    eliminarUbicacion(index: number) {
        this.ubicacionesForm.removeAt(index);
    }

    hideDialog() {
        this.visible.set(false);
        this.submitted = false;
        this.errorMessage = '';
    }

    async save() {
        this.submitted = true;
        this.errorMessage = '';

        if (this.form.invalid) {
            this.errorMessage = 'Complete todos los campos obligatorios marcados con *.';
            return;
        }

        const raw = this.form.getRawValue();
        const prioridadLabel =
            this.prioridades().find((p) => p.id_prioridad === raw.idPrioridad)?.nombre_prioridad || '';

        const clienteFinal: Cliente = {
            ...this.clienteData(),
            idPrefijo: raw.idPrefijo,
            documentoIdentidad: {
                prefijo: this.prefijos().find((p) => p.id_prefijo === raw.idPrefijo)?.prefijo || '',
                numero: raw.rif,
            },
            nombreComercial: raw.nombreComercial,
            telefono: raw.telefono,
            correo: raw.correo,
            personaContacto: raw.personaContacto,
            idPrioridad: raw.idPrioridad,
            prioridad: prioridadLabel,
            ubicaciones: raw.ubicaciones
                .filter((u: any) => u.direccion?.trim())
                .map((u: any) => ({
                    idMunicipio: u.idMunicipio,
                    municipio: this.municipios().find((m) => m.id_municipio === u.idMunicipio)?.nombre || '',
                    direccion: u.direccion,
                    referencia: u.referencia,
                    pais: 'Venezuela',
                    estado: 'Nueva Esparta',
                    nombreContacto: u.nombreContacto,
                    telefonoContacto: u.telefonoContacto,
                    reglas: {
                        horarioDesde: u.reglas.horarioDesde,
                        horarioHasta: u.reglas.horarioHasta,
                        diasRecepcion: u.reglas.diasRecepcion,
                        requiereCita: u.reglas.requiereCita,
                        instrucciones: u.reglas.instrucciones,
                    },
                })),
        };

        try {
            const clienteId = await this.clienteService.crearCliente(clienteFinal);
            await this.clienteService.guardarUbicaciones(clienteId, clienteFinal.ubicaciones || []);
            clienteFinal.id = clienteId;
            clienteFinal.idCliente = clienteId;
            this.onSave.emit(clienteFinal);
            this.visible.set(false);
        } catch (e: any) {
            this.errorMessage = e.message || 'Error al guardar el cliente';
        }
    }
}

import {
    Component,
    input,
    output,
    model,
    effect,
    inject,
    signal,
    OnInit,
    OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { FluidModule } from 'primeng/fluid';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { DatePickerModule } from 'primeng/datepicker';
import { DividerModule } from 'primeng/divider';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectButtonModule } from 'primeng/selectbutton';

import { ClienteService, MunicipioItem } from '../service/cliente.service';
import { SucursalCliente } from '../clientes.types';
import { DIAS_RECEPCION, OPCIONES_CITA } from '../clientes.constants';
import { MapaSucursalComponent } from './mapa-sucursal.component';

@Component({
    selector: 'app-sucursal-dialog',
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
        DatePickerModule,
        DividerModule,
        MultiSelectModule,
        SelectButtonModule,
        MapaSucursalComponent,
    ],
    template: `
        <p-dialog
            [(visible)]="visible"
            [style]="{ width: '600px' }"
            [header]="sucursalData()?.id ? 'Editar Sucursal' : 'Agregar Sucursal'"
            [modal]="true"
        >
            <ng-template #content>
                <form [formGroup]="form" class="flex flex-col gap-3 pt-2">
                    <p-message
                        *ngIf="errorMessage()"
                        severity="error"
                        [text]="errorMessage()"
                        class="mb-1"
                    />

                    <p-fluid>
                        <div class="flex flex-col gap-2">
                            <label for="municipio" class="font-semibold text-sm"
                                >Municipio <span class="text-red-500">*</span></label
                            >
                            <p-select
                                id="municipio"
                                formControlName="idMunicipio"
                                [options]="municipios()"
                                optionLabel="nombre"
                                optionValue="id_municipio"
                                placeholder="Seleccionar municipio"
                                appendTo="body"
                            />
                            <small
                                *ngIf="submitted && form.get('idMunicipio')?.invalid"
                                class="text-red-500"
                            >
                                Seleccione un municipio
                            </small>
                        </div>

                        <div class="flex flex-col gap-2 mt-2">
                            <label for="direccion" class="font-semibold text-sm"
                                >Dirección Completa <span class="text-red-500">*</span></label
                            >
                            <textarea
                                pTextarea
                                id="direccion"
                                formControlName="direccion"
                                rows="2"
                                placeholder="Av. Principal, Edif. Centro, Piso 1, Local 2"
                            ></textarea>
                            <small
                                *ngIf="submitted && form.get('direccion')?.invalid"
                                class="text-red-500"
                            >
                                La dirección es obligatoria
                            </small>
                        </div>

                        <div class="flex flex-col gap-2 mt-2">
                            <label for="puntoDeReferencia" class="font-semibold text-sm"
                                >Punto de Referencia</label
                            >
                            <input
                                pInputText
                                id="puntoDeReferencia"
                                formControlName="puntoDeReferencia"
                                placeholder="Ej: Frente a la plaza, al lado del banco"
                            />
                        </div>

                        <input type="hidden" formControlName="latitud" />
                        <input type="hidden" formControlName="longitud" />

                        <app-mapa-sucursal
                            [sucursalGroup]="form"
                            [municipioNombre]="municipioNombre()"
                        />

                        <p-divider class="my-1" />

                        <div
                            class="text-sm font-semibold text-surface-600 dark:text-surface-300 mt-2"
                        >
                            <i class="pi pi-clock mr-1"></i> Reglas de Recepción
                        </div>

                        <div formGroupName="reglas">
                            <div class="grid grid-cols-12 gap-3 mt-2">
                                <div class="col-span-4 flex flex-col gap-2">
                                    <label for="horaDesde" class="font-semibold text-sm"
                                        >Desde</label
                                    >
                                    <p-datepicker
                                        id="horaDesde"
                                        formControlName="horaDesde"
                                        timeOnly
                                        hourFormat="24"
                                        [showIcon]="true"
                                        iconDisplay="input"
                                        [icon]="'pi pi-clock'"
                                        appendTo="body"
                                    />
                                </div>
                                <div class="col-span-4 flex flex-col gap-2">
                                    <label for="horaHasta" class="font-semibold text-sm"
                                        >Hasta</label
                                    >
                                    <p-datepicker
                                        id="horaHasta"
                                        formControlName="horaHasta"
                                        timeOnly
                                        hourFormat="24"
                                        [showIcon]="true"
                                        iconDisplay="input"
                                        [icon]="'pi pi-clock'"
                                        appendTo="body"
                                    />
                                </div>
                                <div class="col-span-8 flex flex-col gap-2">
                                    <label for="diasRecepcion" class="font-semibold text-sm"
                                        >Días de Recepción</label
                                    >
                                    <p-multiselect
                                        id="diasRecepcion"
                                        formControlName="diasRecepcion"
                                        [options]="diasSemana"
                                        optionLabel="label"
                                        optionValue="value"
                                        placeholder="Seleccionar días"
                                        [maxSelectedLabels]="3"
                                        appendTo="body"
                                    />
                                </div>
                            </div>

                            <div class="flex flex-col gap-2 mt-2">
                                <label class="font-semibold text-sm">Requiere Cita Previa</label>
                                <p-selectbutton
                                    formControlName="requiereCita"
                                    [options]="opcionesCita"
                                    optionLabel="label"
                                    optionValue="value"
                                    [allowEmpty]="false"
                                />
                            </div>

                            <div class="flex flex-col gap-2 mt-2">
                                <label for="instrucciones" class="font-semibold text-sm"
                                    >Instrucciones / Reglas Adicionales</label
                                >
                                <textarea
                                    pTextarea
                                    id="instrucciones"
                                    formControlName="instrucciones"
                                    rows="2"
                                    placeholder="Ej: Recepción por el muelle trasero."
                                ></textarea>
                            </div>
                        </div>

                        <p-divider class="my-1" />

                        <div class="text-sm font-semibold text-surface-600 dark:text-surface-300">
                            <i class="pi pi-user mr-1"></i> Datos de Contacto
                        </div>

                        <div class="grid grid-cols-12 gap-3 mt-2">
                            <div class="col-span-6 flex flex-col gap-2">
                                <label for="nombreContacto" class="font-semibold text-sm"
                                    >Nombre de Contacto</label
                                >
                                <input
                                    pInputText
                                    id="nombreContacto"
                                    formControlName="nombreContacto"
                                    placeholder="Ej: Juan Pérez"
                                />
                            </div>
                            <div class="col-span-6 flex flex-col gap-2">
                                <label for="telefonoContacto" class="font-semibold text-sm"
                                    >Teléfono de Contacto</label
                                >
                                <input
                                    pInputText
                                    id="telefonoContacto"
                                    formControlName="telefonoContacto"
                                    placeholder="Ej: 0295-1234567"
                                />
                            </div>
                        </div>
                    </p-fluid>
                </form>
            </ng-template>

            <ng-template #footer>
                <p-button label="Cancelar" icon="pi pi-times" text (onClick)="hideDialog()" />
                <p-button
                    label="Guardar"
                    icon="pi pi-check"
                    [loading]="saving()"
                    [disabled]="saving()"
                    (onClick)="save()"
                />
            </ng-template>
        </p-dialog>
    `,
})
export class SucursalDialogComponent implements OnInit, OnDestroy {
    private fb = inject(FormBuilder);
    private clienteService = inject(ClienteService);

    visible = model<boolean>(false);
    clienteId = input.required<string>();
    sucursalData = input<SucursalCliente | null>(null);
    onSave = output<void>();

    private destroy$ = new Subject<void>();

    submitted = false;
    saving = signal(false);
    errorMessage = signal('');

    municipios = signal<MunicipioItem[]>([]);
    diasSemana = DIAS_RECEPCION;
    opcionesCita = OPCIONES_CITA;

    municipioNombre = signal('');

    form: FormGroup = this.fb.group({
        idMunicipio: ['', Validators.required],
        direccion: ['', Validators.required],
        puntoDeReferencia: [''],
        latitud: [null],
        longitud: [null],
        reglas: this.fb.group({
            horaDesde: [null],
            horaHasta: [null],
            diasRecepcion: [[]],
            requiereCita: [false],
            instrucciones: [''],
        }),
        nombreContacto: [''],
        telefonoContacto: [''],
    });

    constructor() {
        effect(() => {
            const data = this.sucursalData();
            if (data) {
                this.loadSucursal(data);
            } else if (this.visible()) {
                this.resetForm();
            }
        });
    }

    ngOnInit() {
        this.cargarMunicipios();

        this.form
            .get('idMunicipio')
            ?.valueChanges.pipe(takeUntil(this.destroy$))
            .subscribe((id) => {
                const nombre = this.municipios().find((m) => m.id_municipio === id)?.nombre || '';
                this.municipioNombre.set(nombre);
            });
    }

    private async cargarMunicipios() {
        try {
            const items = await this.clienteService.obtenerMunicipios();
            this.municipios.set(items);
        } catch {
            /* ok */
        }
    }

    hideDialog() {
        this.visible.set(false);
        this.submitted = false;
        this.errorMessage.set('');
        this.form.markAsPristine();
        this.form.markAsUntouched();
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

    loadSucursal(suc: SucursalCliente) {
        const nombre =
            this.municipios().find((m) => m.id_municipio === suc.idMunicipio)?.nombre || '';
        this.municipioNombre.set(nombre);

        this.form.patchValue({
            idMunicipio: suc.idMunicipio || '',
            direccion: suc.direccion || '',
            puntoDeReferencia: suc.puntoDeReferencia || '',
            latitud: suc.latitud ?? null,
            longitud: suc.longitud ?? null,
            reglas: {
                horaDesde: suc.reglas?.horaDesde
                    ? this.horaStringToDate(suc.reglas.horaDesde)
                    : null,
                horaHasta: suc.reglas?.horaHasta
                    ? this.horaStringToDate(suc.reglas.horaHasta)
                    : null,
                diasRecepcion: suc.reglas?.diasRecepcion || [],
                requiereCita: suc.reglas?.requiereCita ?? false,
                instrucciones: suc.reglas?.instrucciones || '',
            },
            nombreContacto: suc.nombreContacto || '',
            telefonoContacto: suc.telefonoContacto || '',
        });
    }

    resetForm() {
        this.form.reset({
            idMunicipio: '',
            direccion: '',
            puntoDeReferencia: '',
            latitud: null,
            longitud: null,
            reglas: {
                horaDesde: null,
                horaHasta: null,
                diasRecepcion: [],
                requiereCita: false,
                instrucciones: '',
            },
            nombreContacto: '',
            telefonoContacto: '',
        });
        this.municipioNombre.set('');
    }

    async save() {
        this.submitted = true;
        this.errorMessage.set('');

        if (this.saving()) return;
        if (this.form.invalid) {
            this.errorMessage.set('Complete los campos obligatorios marcados con *.');
            return;
        }
        this.saving.set(true);

        const raw = this.form.getRawValue();
        const sucursalFinal: SucursalCliente = {
            ...(this.sucursalData() || {}),
            idMunicipio: raw.idMunicipio,
            direccion: raw.direccion,
            puntoDeReferencia: raw.puntoDeReferencia,
            latitud: raw.latitud ? Number(raw.latitud) : undefined,
            longitud: raw.longitud ? Number(raw.longitud) : undefined,
            nombreContacto: raw.nombreContacto,
            telefonoContacto: raw.telefonoContacto,
            reglas: {
                horaDesde: this.horaDateToString(raw.reglas.horaDesde),
                horaHasta: this.horaDateToString(raw.reglas.horaHasta),
                diasRecepcion: raw.reglas.diasRecepcion,
                requiereCita: raw.reglas.requiereCita,
                instrucciones: raw.reglas.instrucciones,
            },
        };

        try {
            const actuales = await this.clienteService.obtenerSucursales(this.clienteId());
            const esEdicion = !!this.sucursalData()?.id;

            if (esEdicion) {
                const idx = actuales.findIndex((s) => s.id === this.sucursalData()!.id);
                if (idx >= 0) {
                    actuales[idx] = sucursalFinal;
                } else {
                    actuales.push(sucursalFinal);
                }
            } else {
                actuales.push(sucursalFinal);
            }

            await this.clienteService.guardarSucursales(this.clienteId(), actuales);
            this.onSave.emit();
            this.visible.set(false);
            this.saving.set(false);
        } catch (e: any) {
            this.errorMessage.set(e.message || 'Error al guardar la sucursal');
            this.saving.set(false);
        }
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }
}

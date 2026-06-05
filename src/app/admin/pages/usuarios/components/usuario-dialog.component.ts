import { Component, input, output, model, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { FluidModule } from 'primeng/fluid';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { DividerModule } from 'primeng/divider';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';

import {
    Usuario, ROLES, PREFIJOS_DOCUMENTO,
    GRADOS_LICENCIA, PRIORIDADES, MUNICIPIOS_NUEVA_ESPARTA,
    UbicacionResumen,
} from '../data/usuarios-mock';

@Component({
    selector: 'app-usuario-dialog',
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
        DatePickerModule,
        SelectButtonModule,
        TooltipModule,
    ],
    templateUrl: './usuario-dialog.component.html',
})
export class UsuarioDialogComponent {
    private fb = inject(FormBuilder);

    visible = model<boolean>(false);
    usuarioData = input<Usuario>({} as Usuario);
    onSave = output<Usuario>();

    submitted = false;
    errorMessage = '';

    roles = ROLES;
    prefijosDoc = PREFIJOS_DOCUMENTO;
    gradosLicencia = GRADOS_LICENCIA;
    prioridades = PRIORIDADES;
    municipios = MUNICIPIOS_NUEVA_ESPARTA;

    activoOptions = [
        { label: 'Activo', value: true },
        { label: 'Inactivo', value: false },
    ];

    form: FormGroup = this.fb.group({
        username: ['', [Validators.required, Validators.minLength(4)]],
        email: ['', [Validators.required, Validators.email]],
        password: [''],
        prefijoDoc: ['V', Validators.required],
        numeroDoc: [null, [Validators.required, Validators.min(10000), Validators.max(999999999999)]],
        nombreCompleto: ['', Validators.required],
        telefono: [''],
        rol: ['', Validators.required],
        activo: [true],
        fechaIngreso: [null],
        licenciaNumero: [''],
        licenciaGrado: [''],
        licenciaVencimiento: [null],
        certMedicoNumero: [''],
        certMedicoExpedicion: [null],
        certMedicoVencimiento: [null],
        nombreComercial: [''],
        idPrioridad: ['MEDIA'],
        ubicaciones: this.fb.array([]),
    });

    get ubicacionesForm(): FormArray {
        return this.form.get('ubicaciones') as FormArray;
    }

    get rolValue(): string {
        return this.form.get('rol')?.value || '';
    }

    private crearUbicacionGroup(ub: UbicacionResumen = {}): FormGroup {
        return this.fb.group({
            municipio: [ub.municipio || '', Validators.required],
            direccion: [ub.direccion || '', Validators.required],
            pais: [{ value: ub.pais || 'Venezuela', disabled: true }],
            estado: [{ value: ub.estado || 'Nueva Esparta', disabled: true }],
            referencia: [ub.referencia || ''],
        });
    }

    agregarUbicacion() {
        this.ubicacionesForm.push(this.crearUbicacionGroup());
    }

    eliminarUbicacion(index: number) {
        this.ubicacionesForm.removeAt(index);
    }

    constructor() {
        effect(() => {
            const data = this.usuarioData();
            this.submitted = false;
            this.errorMessage = '';

            this.form.patchValue({
                username: data.username || '',
                email: data.email || '',
                password: '',
                prefijoDoc: data.documentoIdentidad?.prefijo || 'V',
                numeroDoc: data.documentoIdentidad?.numero ? Number(data.documentoIdentidad.numero) : null,
                nombreCompleto: data.nombreCompleto || '',
                telefono: data.telefono || '',
                rol: data.rol || '',
                activo: data.activo ?? true,
                fechaIngreso: data.fechaIngreso ? new Date(data.fechaIngreso) : null,
                licenciaNumero: data.licencia?.numero || '',
                licenciaGrado: data.licencia?.grado || '',
                licenciaVencimiento: data.licencia?.fechaVencimiento ? new Date(data.licencia.fechaVencimiento) : null,
                certMedicoNumero: data.certificadoMedico?.numero || '',
                certMedicoExpedicion: data.certificadoMedico?.fechaExpedicion ? new Date(data.certificadoMedico.fechaExpedicion) : null,
                certMedicoVencimiento: data.certificadoMedico?.fechaVencimiento ? new Date(data.certificadoMedico.fechaVencimiento) : null,
                nombreComercial: data.nombreComercial || '',
                idPrioridad: data.idPrioridad || 'MEDIA',
            });

            this.ubicacionesForm.clear();
            const ubs: UbicacionResumen[] = data.ubicaciones?.length
                ? data.ubicaciones
                : [{ municipio: '', direccion: '', referencia: '', pais: 'Venezuela', estado: 'Nueva Esparta' }];

            for (const ub of ubs) {
                this.ubicacionesForm.push(this.crearUbicacionGroup(ub));
            }
        });
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

    private addChoferValidation() {
        const licNum = this.form.get('licenciaNumero');
        const licGrado = this.form.get('licenciaGrado');
        const licVenc = this.form.get('licenciaVencimiento');
        const certNum = this.form.get('certMedicoNumero');
        const certExp = this.form.get('certMedicoExpedicion');
        const certVenc = this.form.get('certMedicoVencimiento');

        if (this.rolValue === 'CHOFER' || this.rolValue === 'AYUDANTE') {
            licNum?.setValidators([Validators.required]);
            licGrado?.setValidators([Validators.required]);
            licVenc?.setValidators([Validators.required]);
            certNum?.setValidators([Validators.required]);
            certExp?.setValidators([Validators.required]);
            certVenc?.setValidators([Validators.required]);
        } else {
            licNum?.clearValidators();
            licGrado?.clearValidators();
            licVenc?.clearValidators();
            certNum?.clearValidators();
            certExp?.clearValidators();
            certVenc?.clearValidators();
        }
        licNum?.updateValueAndValidity();
        licGrado?.updateValueAndValidity();
        licVenc?.updateValueAndValidity();
        certNum?.updateValueAndValidity();
        certExp?.updateValueAndValidity();
        certVenc?.updateValueAndValidity();
    }

    private addClienteValidation() {
        const nombreComercial = this.form.get('nombreComercial');
        if (this.rolValue === 'CLIENTE') {
            nombreComercial?.setValidators([Validators.required]);
        } else {
            nombreComercial?.clearValidators();
        }
        nombreComercial?.updateValueAndValidity();
    }

    onRolChange() {
        this.addChoferValidation();
        this.addClienteValidation();
    }

    save() {
        this.submitted = true;
        this.errorMessage = '';
        this.addChoferValidation();
        this.addClienteValidation();

        if (this.form.invalid) {
            this.errorMessage = 'Complete todos los campos obligatorios marcados con *.';
            return;
        }

        const raw = this.form.getRawValue();

        if (!raw.password && !this.usuarioData().id) {
            this.errorMessage = 'La contraseña es obligatoria para nuevos usuarios.';
            return;
        }

        const prioridadLabel = this.prioridades.find(p => p.value === raw.idPrioridad)?.label || '';

        const usuarioFinal: Usuario = {
            ...this.usuarioData(),
            username: raw.username,
            email: raw.email,
            password: raw.password || this.usuarioData().password,
            documentoIdentidad: {
                prefijo: raw.prefijoDoc,
                numero: String(raw.numeroDoc),
            },
            nombreCompleto: raw.nombreCompleto,
            telefono: raw.telefono || '',
            rol: raw.rol,
            activo: raw.activo,
            fechaCreacion: this.usuarioData().fechaCreacion || this.formatDate(new Date()),
            fechaIngreso: raw.fechaIngreso ? this.formatDate(raw.fechaIngreso) : undefined,
            licencia: (raw.rol === 'CHOFER' || raw.rol === 'AYUDANTE')
                ? {
                    numero: raw.licenciaNumero,
                    grado: raw.licenciaGrado,
                    fechaVencimiento: raw.licenciaVencimiento ? this.formatDate(raw.licenciaVencimiento) : '',
                }
                : undefined,
            certificadoMedico: (raw.rol === 'CHOFER' || raw.rol === 'AYUDANTE')
                ? {
                    numero: raw.certMedicoNumero,
                    fechaExpedicion: raw.certMedicoExpedicion ? this.formatDate(raw.certMedicoExpedicion) : '',
                    fechaVencimiento: raw.certMedicoVencimiento ? this.formatDate(raw.certMedicoVencimiento) : '',
                }
                : undefined,
            nombreComercial: raw.rol === 'CLIENTE' ? raw.nombreComercial : undefined,
            idPrioridad: raw.rol === 'CLIENTE' ? raw.idPrioridad : undefined,
            prioridad: raw.rol === 'CLIENTE' ? prioridadLabel : undefined,
            ubicaciones: raw.rol === 'CLIENTE'
                ? raw.ubicaciones
                    .filter((u: UbicacionResumen) => u.direccion?.trim())
                    .map((u: UbicacionResumen) => ({
                        ...u,
                        pais: 'Venezuela',
                        estado: 'Nueva Esparta',
                    }))
                : undefined,
        };

        this.onSave.emit(usuarioFinal);
        this.visible.set(false);
    }
}

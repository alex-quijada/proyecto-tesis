import { Component, input, output, model, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { FluidModule } from 'primeng/fluid';
import { MessageModule } from 'primeng/message';
import { DividerModule } from 'primeng/divider';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectButtonModule } from 'primeng/selectbutton';

import { AuthService } from '../../../../auth/service/auth.service';
import { supabase } from '../../../../core/supabase.client';
import { MessageService } from 'primeng/api';

import {
    Usuario, ROLES, PREFIJOS_DOCUMENTO, GRADOS_LICENCIA,
} from '../data/usuarios-mock';

const ROL_MAP_TO_DB: Record<string, string> = {
    ADMIN: 'administrador',
    ANALISTA: 'analista',
    CHOFER: 'chofer',
    AYUDANTE: 'ayudante',
};

@Component({
    selector: 'app-usuario-dialog',
    standalone: true,
    imports: [
        CommonModule, ReactiveFormsModule, DialogModule, ButtonModule,
        InputTextModule, InputNumberModule, SelectModule, FluidModule,
        MessageModule, DividerModule, DatePickerModule,
        SelectButtonModule,
    ],
    providers: [MessageService],
    templateUrl: './usuario-dialog.component.html',
})
export class UsuarioDialogComponent {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private messageService = inject(MessageService);

    visible = model<boolean>(false);
    usuarioData = input<Usuario>({} as Usuario);
    onSave = output<Usuario>();

    submitted = false;
    errorMessage = '';
    loading = signal(false);

    roles = ROLES.filter(r => r.value !== 'CLIENTE');
    prefijosDoc = PREFIJOS_DOCUMENTO;
    gradosLicencia = GRADOS_LICENCIA;

    activoOptions = [
        { label: 'Activo', value: true },
        { label: 'Inactivo', value: false },
    ];

    form: FormGroup = this.fb.group({
        email: ['chofer_test@logistica.com', [Validators.required, Validators.email]],
        password: ['123456', [Validators.required, Validators.minLength(6)]],
        prefijoDoc: ['V', Validators.required],
        numeroDoc: [87654321, [Validators.required, Validators.min(10000), Validators.max(999999999999)]],
        nombreCompleto: ['Carlos Test', Validators.required],
        telefono: ['0414-1112233'],
        rol: ['CHOFER', Validators.required],
        activo: [true],
        fechaIngreso: [new Date()],
        licenciaNumero: ['L-87654321'],
        licenciaGrado: ['3ra'],
        licenciaVencimiento: [new Date('2027-12-31')],
        certMedicoNumero: ['CMV-123456'],
        certMedicoExpedicion: [new Date('2026-01-15')],
        certMedicoVencimiento: [new Date('2027-01-15')],
    });

    get rolValue(): string {
        return this.form.get('rol')?.value || '';
    }

    get isEditing(): boolean {
        return !!this.usuarioData().id;
    }

    constructor() {
        setTimeout(() => this.actualizarValidaciones());
        effect(() => {
            const data = this.usuarioData();
            this.submitted = false;
            this.errorMessage = '';

            if (data.id) {
                this.form.patchValue({
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
                });
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

    private actualizarValidaciones() {
        const controls = this.form.controls;
        const esChofer = this.rolValue === 'CHOFER';
        const esChoferOAyudante = esChofer || this.rolValue === 'AYUDANTE';

        const setReq = (name: string, required: boolean) => {
            const c = controls[name];
            if (required) {
                c?.setValidators([Validators.required]);
            } else {
                c?.clearValidators();
            }
            c?.updateValueAndValidity();
        };

        setReq('licenciaNumero', esChofer);
        setReq('licenciaGrado', esChofer);
        setReq('licenciaVencimiento', esChofer);
        setReq('certMedicoNumero', esChoferOAyudante);
        setReq('certMedicoExpedicion', esChoferOAyudante);
        setReq('certMedicoVencimiento', esChoferOAyudante);
    }

    onRolChange() {
        this.actualizarValidaciones();
    }

    private buildUsuarioFromForm(): Usuario {
        const raw = this.form.getRawValue();

        return {
            ...this.usuarioData(),
            email: raw.email,
            documentoIdentidad: { prefijo: raw.prefijoDoc, numero: String(raw.numeroDoc) },
            nombreCompleto: raw.nombreCompleto,
            telefono: raw.telefono || '',
            rol: raw.rol,
            activo: raw.activo,
            fechaCreacion: this.usuarioData().fechaCreacion || this.formatDate(new Date()),
            fechaIngreso: raw.fechaIngreso ? this.formatDate(raw.fechaIngreso) : undefined,
            licencia: raw.rol === 'CHOFER'
                ? { numero: raw.licenciaNumero, grado: raw.licenciaGrado, fechaVencimiento: raw.licenciaVencimiento ? this.formatDate(raw.licenciaVencimiento) : '' }
                : undefined,
            certificadoMedico: (raw.rol === 'CHOFER' || raw.rol === 'AYUDANTE')
                ? { numero: raw.certMedicoNumero, fechaExpedicion: raw.certMedicoExpedicion ? this.formatDate(raw.certMedicoExpedicion) : '', fechaVencimiento: raw.certMedicoVencimiento ? this.formatDate(raw.certMedicoVencimiento) : '' }
                : undefined,
        };
    }

    async save() {
        this.submitted = true;
        this.errorMessage = '';
        this.loading.set(true);
        this.actualizarValidaciones();
        this.form.updateValueAndValidity();

        if (this.form.invalid) {
            const errores: Record<string, any> = {};
            Object.keys(this.form.controls).forEach(key => {
                const c = this.form.get(key);
                if (c?.invalid) errores[key] = c.errors;
            });
            console.log('Errores del formulario:', errores);
            this.errorMessage = 'Complete todos los campos obligatorios.';
            this.loading.set(false);
            return;
        }

        try {
            const raw = this.form.getRawValue();
            if (this.isEditing) {
                await this.actualizarUsuario(raw);
            } else {
                await this.crearUsuario(raw);
            }
        } catch (error: any) {
            this.errorMessage = error.message || 'Error al procesar la solicitud.';
            this.loading.set(false);
        }
    }

    private async crearUsuario(raw: any) {
        if (!raw.password) {
            this.errorMessage = 'La contraseña es obligatoria.';
            this.loading.set(false);
            return;
        }

        const dbRole = ROL_MAP_TO_DB[raw.rol];
        if (!dbRole) {
            this.errorMessage = `Rol "${raw.rol}" no válido.`;
            this.loading.set(false);
            return;
        }

        const payload: any = {
            email: raw.email,
            password: raw.password,
            nombre_completo: raw.nombreCompleto,
            cedula: Number(raw.numeroDoc),
            nombre_rol: dbRole,
        };

        if (raw.rol === 'CHOFER' || raw.rol === 'AYUDANTE') {
            payload.certificado_numero = raw.certMedicoNumero;
            payload.certificado_vencimiento = this.formatDate(raw.certMedicoVencimiento);
        }

        if (raw.rol === 'CHOFER') {
            payload.licencia_numero = raw.licenciaNumero;
            payload.licencia_grado = raw.licenciaGrado;
            payload.licencia_vencimiento = this.formatDate(raw.licenciaVencimiento);
        }

        await this.authService.registrarUsuarioPorRol(payload);

        this.messageService.add({
            severity: 'success',
            summary: 'Registrado',
            detail: `${raw.nombreCompleto} creado exitosamente.`,
        });

        this.cerrarYOutput(raw);
    }

    private async actualizarUsuario(raw: any) {
        const id = this.usuarioData().id!;
        const dbRole = ROL_MAP_TO_DB[raw.rol];
        const { data: rolData } = await supabase.from('roles').select('id_rol').eq('nombre_rol', dbRole).single();
        if (!rolData) throw new Error('Rol no encontrado.');

        await supabase.from('usuarios').update({
            email: raw.email,
            id_rol: rolData.id_rol,
            nombre_completo: raw.nombreCompleto,
            cedula: Number(raw.numeroDoc),
        }).eq('id_usuario', id);

        this.messageService.add({
            severity: 'success',
            summary: 'Actualizado',
            detail: `${raw.nombreCompleto} modificado exitosamente.`,
        });

        this.cerrarYOutput(raw);
    }

    private cerrarYOutput(raw: any) {
        const usuarioFinal = this.buildUsuarioFromForm();
        this.onSave.emit(usuarioFinal);
        this.visible.set(false);
        this.loading.set(false);
    }
}

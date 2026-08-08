import { Component, input, output, model, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { FluidModule } from 'primeng/fluid';
import { MessageModule } from 'primeng/message';
import { DividerModule } from 'primeng/divider';
import { DatePickerModule } from 'primeng/datepicker';
import { PasswordModule } from 'primeng/password';

import { AuthService } from '../../../../auth/service/auth.service';
import { MessageService } from 'primeng/api';

import { Usuario, ROLES, PREFIJOS_DOCUMENTO, GRADOS_LICENCIA } from '../data/usuarios-mock';

const ROL_MAP_TO_DB: Record<string, string> = {
    ADMIN: 'Administrador',
    ANALISTA: 'Analista',
    CHOFER: 'Chofer',
    AYUDANTE: 'Ayudante',
};

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
        DividerModule,
        DatePickerModule,
        PasswordModule,
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
    errorMessage = signal('');
    loading = signal(false);

    roles = ROLES.filter((r) => r.value !== 'CLIENTE');
    prefijosDoc = PREFIJOS_DOCUMENTO;
    gradosLicencia = GRADOS_LICENCIA;

    form: FormGroup = this.fb.group({
        email: [
            '',
            [
                Validators.required,
                Validators.email,
                (c: AbstractControl) => {
                    const v = (c.value || '').trim();
                    if (!v) return null;
                    return v.includes('@') && v.endsWith('@brandia.com')
                        ? null
                        : { dominioBrandia: true };
                },
            ],
        ],
        password: ['', [Validators.minLength(6)]],
        prefijoDoc: ['V', Validators.required],
        numeroDoc: [0, [Validators.required, Validators.min(10000), Validators.max(999999999999)]],
        nombreCompleto: ['', Validators.required],
        rol: ['ANALISTA', Validators.required],
        licenciaNumero: [''],
        licenciaGrado: ['3ra'],
        licenciaExpedicion: [null],
        certMedicoNumero: [''],
        certMedicoExpedicion: [null],
    });

    private defaultFormValues(): Record<string, any> {
        return {
            email: '',
            password: '',
            prefijoDoc: 'V',
            numeroDoc: 0,
            nombreCompleto: '',
            rol: 'ANALISTA',
            licenciaNumero: '',
            licenciaGrado: '3ra',
            licenciaExpedicion: null,
            certMedicoNumero: '',
            certMedicoExpedicion: null,
        };
    }

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
            this.errorMessage.set('');
            this.form.markAsPristine();
            this.form.markAsUntouched();

            if (data.id) {
                this.form.patchValue({
                    email: data.email || '',
                    password: '',
                    prefijoDoc: data.documentoIdentidad?.prefijo || 'V',
                    numeroDoc: data.documentoIdentidad?.numero
                        ? Number(data.documentoIdentidad.numero)
                        : null,
                    nombreCompleto: data.nombreCompleto || '',
                    rol: data.rol || '',
                    licenciaNumero: data.licencia?.numero || '',
                    licenciaGrado: data.licencia?.grado || '',
                    licenciaExpedicion: this.parseLocalDate(data.licencia?.fechaExpedicion),
                    certMedicoNumero: data.certificadoMedico?.numero || '',
                    certMedicoExpedicion: this.parseLocalDate(
                        data.certificadoMedico?.fechaExpedicion,
                    ),
                });
            } else {
                this.form.reset(this.defaultFormValues());
            }
            this.ajustarValidadorPassword();
        });
    }

    hideDialog() {
        this.visible.set(false);
        this.submitted = false;
        this.errorMessage.set('');
        this.form.reset(this.defaultFormValues());
    }

    private formatDate(d: Date | null | undefined): string {
        if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private parseLocalDate(dateStr: string | undefined | null): Date | null {
        if (!dateStr) return null;
        const [y, m, d] = dateStr.split('-').map(Number);
        if (!y || !m || !d) return null;
        return new Date(y, m - 1, d);
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
        setReq('licenciaExpedicion', esChofer);
        setReq('certMedicoNumero', esChoferOAyudante);
        setReq('certMedicoExpedicion', esChoferOAyudante);
    }

    private ajustarValidadorPassword() {
        const passwordControl = this.form.get('password');
        if (!passwordControl) return;
        if (this.isEditing) {
            passwordControl.removeValidators(Validators.required);
        } else {
            passwordControl.addValidators(Validators.required);
        }
        passwordControl.updateValueAndValidity();
    }

    onRolChange() {
        this.actualizarValidaciones();
    }

    onBlurDominio() {
        const c = this.form.get('email');
        const v = (c?.value ?? '').trim();
        if (!v) return;
        c?.setValue(`${v.split('@')[0]}@brandia.com`);
        c?.updateValueAndValidity();
    }

    get licenciaVencimientoCalculado(): string {
        return this.calcularVencimiento(this.form.get('licenciaExpedicion')?.value, 10);
    }

    get certMedicoVencimientoCalculado(): string {
        return this.calcularVencimiento(this.form.get('certMedicoExpedicion')?.value, 5);
    }

    private calcularVencimiento(d: Date | null | undefined, years: number): string {
        if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
        const fecha = new Date(d);
        fecha.setFullYear(fecha.getFullYear() + years);
        const lastDay = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
        if (fecha.getDate() > lastDay) fecha.setDate(lastDay);
        return this.formatDate(fecha);
    }

    private buildUsuarioFromForm(): Usuario {
        const raw = this.form.getRawValue();
        const emailFinal = `${(raw.email || '').split('@')[0]}@brandia.com`;

        return {
            ...this.usuarioData(),
            email: emailFinal,
            documentoIdentidad: { prefijo: raw.prefijoDoc, numero: String(raw.numeroDoc) },
            nombreCompleto: raw.nombreCompleto,
            rol: raw.rol,
            fechaCreacion: this.usuarioData().fechaCreacion || this.formatDate(new Date()),
            licencia:
                raw.rol === 'CHOFER'
                    ? {
                          numero: raw.licenciaNumero,
                          grado: raw.licenciaGrado,
                          fechaExpedicion: raw.licenciaExpedicion
                              ? this.formatDate(raw.licenciaExpedicion)
                              : '',
                          fechaVencimiento: this.licenciaVencimientoCalculado,
                      }
                    : undefined,
            certificadoMedico:
                raw.rol === 'CHOFER' || raw.rol === 'AYUDANTE'
                    ? {
                          numero: raw.certMedicoNumero,
                          fechaExpedicion: raw.certMedicoExpedicion
                              ? this.formatDate(raw.certMedicoExpedicion)
                              : '',
                          fechaVencimiento: this.certMedicoVencimientoCalculado,
                      }
                    : undefined,
        };
    }

    async save() {
        this.submitted = true;
        this.errorMessage.set('');
        this.loading.set(true);
        this.actualizarValidaciones();
        this.form.updateValueAndValidity();

        if (this.form.invalid) {
            const errores: Record<string, any> = {};
            Object.keys(this.form.controls).forEach((key) => {
                const c = this.form.get(key);
                if (c?.invalid) errores[key] = c.errors;
            });
            console.log('Errores del formulario:', errores);
            this.errorMessage.set('Complete todos los campos obligatorios.');
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
            this.errorMessage.set(error.message || 'Error al procesar la solicitud.');
            this.loading.set(false);
        }
    }

    private async crearUsuario(raw: any) {
        if (!raw.password) {
            this.errorMessage.set('La contraseña es obligatoria.');
            this.loading.set(false);
            return;
        }

        const dbRole = ROL_MAP_TO_DB[raw.rol];
        if (!dbRole) {
            this.errorMessage.set(`Rol "${raw.rol}" no válido.`);
            this.loading.set(false);
            return;
        }

        const payload: any = {
            email: `${(raw.email || '').split('@')[0]}@brandia.com`,
            password: raw.password,
            nombre_completo: raw.nombreCompleto,
            cedula: Number(raw.numeroDoc),
            nombre_rol: dbRole,
            prefijo_doc: raw.prefijoDoc || 'V',
        };

        if (raw.rol === 'CHOFER' || raw.rol === 'AYUDANTE') {
            payload.certificado_numero = raw.certMedicoNumero;
            payload.certificado_expedicion = this.formatDate(raw.certMedicoExpedicion);
        }

        if (raw.rol === 'CHOFER') {
            payload.licencia_numero = raw.licenciaNumero;
            payload.licencia_grado = raw.licenciaGrado;
            payload.licencia_expedicion = this.formatDate(raw.licenciaExpedicion);
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
        if (!dbRole) {
            this.errorMessage.set(`Rol "${raw.rol}" no válido.`);
            this.loading.set(false);
            return;
        }

        const payload: any = {
            user_id: id,
            email: `${(raw.email || '').split('@')[0]}@brandia.com`,
            nombre_completo: raw.nombreCompleto,
            cedula: Number(raw.numeroDoc),
            nombre_rol: dbRole,
            prefijo_doc: raw.prefijoDoc || 'V',
        };

        if (raw.password) {
            payload.password = raw.password;
        }

        if (raw.rol === 'CHOFER' || raw.rol === 'AYUDANTE') {
            payload.certificado_numero = raw.certMedicoNumero;
            payload.certificado_expedicion = this.formatDate(raw.certMedicoExpedicion);
        }

        if (raw.rol === 'CHOFER') {
            payload.licencia_numero = raw.licenciaNumero;
            payload.licencia_grado = raw.licenciaGrado;
            payload.licencia_expedicion = this.formatDate(raw.licenciaExpedicion);
        }

        await this.authService.actualizarUsuarioPorRol(payload);

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
        this.form.reset(this.defaultFormValues());
    }
}

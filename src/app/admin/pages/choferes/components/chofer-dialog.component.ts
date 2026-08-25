import { Component, input, output, model, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '@/app/services/notification.service';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { FluidModule } from 'primeng/fluid';
import { MessageModule } from 'primeng/message';
import { DatePickerModule } from 'primeng/datepicker';
import { DividerModule } from 'primeng/divider';

import { Chofer, PREFIJOS_CEDULA, GRADOS_LICENCIA } from '../data/choferes-mock';
import { AuthService } from '../../../../auth/service/auth.service';

@Component({
    selector: 'app-chofer-dialog',
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
        DatePickerModule,
        DividerModule,
    ],
    templateUrl: './chofer-dialog.component.html',
})
export class ChoferDialogComponent {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private notif = inject(NotificationService);

    visible = model<boolean>(false);
    choferData = input<Chofer>({});
    onSave = output<Chofer>();

    submitted = false;
    errorMessage = signal('');
    loading = signal(false);

    prefijos = PREFIJOS_CEDULA;
    grados = GRADOS_LICENCIA;
    roles = [
        { label: 'Chofer', value: 'Chofer' },
        { label: 'Ayudante', value: 'Ayudante' },
    ];

    form: FormGroup = this.fb.group({
        documentoIdentidad: this.fb.group({
            prefijo: ['V', Validators.required],
            numero: [
                '',
                [
                    Validators.required,
                    Validators.pattern(/^\d+$/),
                    Validators.minLength(5),
                    Validators.maxLength(9),
                ],
            ],
        }),
        nombreCompleto: ['', Validators.required],
        telefono: ['', [Validators.pattern(/^(\+?\d{1,3}[-.\s]?)?\d{7,12}$/)]],
        rol: ['Chofer', Validators.required],
        licencia: this.fb.group({
            numero: ['', Validators.required],
            grado: ['', Validators.required],
            fechaExpedicion: ['', Validators.required],
        }),
        certificadoMedico: this.fb.group({
            numero: ['', Validators.required],
            fechaExpedicion: ['', Validators.required],
        }),
    });

    constructor() {
        effect(() => {
            const data = this.choferData();
            this.submitted = false;
            this.errorMessage.set('');
            this.loading.set(false);

            this.form.patchValue({
                documentoIdentidad: data.documentoIdentidad || { prefijo: 'V', numero: '' },
                nombreCompleto: data.nombreCompleto || '',
                telefono: data.telefono || '',
                rol: data.rol || 'Chofer',
                licencia: {
                    numero: data.licencia?.numero || '',
                    grado: data.licencia?.grado || '',
                    fechaExpedicion: data.licencia?.fechaExpedicion
                        ? new Date(data.licencia.fechaExpedicion)
                        : null,
                },
                certificadoMedico: {
                    numero: data.certificadoMedico?.numero || '',
                    fechaExpedicion: data.certificadoMedico?.fechaExpedicion
                        ? new Date(data.certificadoMedico.fechaExpedicion)
                        : null,
                },
            });
        });
    }

    hideDialog() {
        this.visible.set(false);
        this.submitted = false;
        this.errorMessage.set('');
        this.loading.set(false);
    }

    private formatDate(d: Date): string {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    get licenciaVencimientoCalculado(): string {
        return this.calcularVencimiento(this.form.get('licencia.fechaExpedicion')?.value, 10);
    }

    get certMedicoVencimientoCalculado(): string {
        return this.calcularVencimiento(
            this.form.get('certificadoMedico.fechaExpedicion')?.value,
            5,
        );
    }

    private calcularVencimiento(d: Date | null | undefined, years: number): string {
        if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
        const fecha = new Date(d);
        fecha.setFullYear(fecha.getFullYear() + years);
        const lastDay = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
        if (fecha.getDate() > lastDay) fecha.setDate(lastDay);
        return this.formatDate(fecha);
    }

    async save() {
        this.submitted = true;
        this.errorMessage.set('');

        if (this.form.invalid) {
            this.errorMessage.set('Complete todos los campos obligatorios marcados con *.');
            return;
        }

        const chofer = this.choferData();
        if (!chofer.id) {
            this.errorMessage.set('No se pudo identificar al usuario.');
            return;
        }

        const raw = this.form.getRawValue();

        const choferFinal: Chofer = {
            ...chofer,
            documentoIdentidad: raw.documentoIdentidad,
            nombreCompleto: raw.nombreCompleto,
            telefono: raw.telefono,
            rol: raw.rol,
            licencia: {
                numero: raw.licencia.numero,
                grado: raw.licencia.grado,
                fechaExpedicion: raw.licencia.fechaExpedicion
                    ? this.formatDate(raw.licencia.fechaExpedicion)
                    : '',
                fechaVencimiento: this.licenciaVencimientoCalculado,
            },
            certificadoMedico: {
                numero: raw.certificadoMedico.numero,
                fechaExpedicion: raw.certificadoMedico.fechaExpedicion
                    ? this.formatDate(raw.certificadoMedico.fechaExpedicion)
                    : '',
                fechaVencimiento: this.certMedicoVencimientoCalculado,
            },
        };

        this.loading.set(true);
        try {
            await this.authService.actualizarUsuarioPorRol({
                user_id: chofer.id,
                email: chofer.email || '',
                password: '',
                nombre_completo: raw.nombreCompleto,
                cedula: Number(raw.documentoIdentidad.numero || 0),
                nombre_rol: raw.rol || 'Chofer',
                prefijo_doc: raw.documentoIdentidad.prefijo || 'V',
                certificado_numero: raw.certificadoMedico.numero || '',
                certificado_expedicion: raw.certificadoMedico.fechaExpedicion
                    ? this.formatDate(raw.certificadoMedico.fechaExpedicion)
                    : null,
                licencia_numero: raw.licencia.numero || '',
                licencia_grado: raw.licencia.grado || '',
                licencia_expedicion: raw.licencia.fechaExpedicion
                    ? this.formatDate(raw.licencia.fechaExpedicion)
                    : null,
            });

            this.notif.add({
                severity: 'success',
                summary: 'Completado',
                detail: `Datos de ${raw.nombreCompleto} actualizados`,
                life: 3000,
            });

            this.onSave.emit(choferFinal);
            this.visible.set(false);
        } catch (error: any) {
            this.errorMessage.set(error.message || 'No se pudieron guardar los cambios');
        } finally {
            this.loading.set(false);
        }
    }
}

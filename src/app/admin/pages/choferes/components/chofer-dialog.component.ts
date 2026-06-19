import { Component, input, output, model, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { FluidModule } from 'primeng/fluid';
import { MessageModule } from 'primeng/message';
import { DatePickerModule } from 'primeng/datepicker';
import { DividerModule } from 'primeng/divider';

import { Chofer, CHOFERES_MOCK, PREFIJOS_CEDULA, GRADOS_LICENCIA } from '../data/choferes-mock';

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

    visible = model<boolean>(false);
    choferData = input<Chofer>({});
    onSave = output<Chofer>();

    submitted = false;
    errorMessage = '';

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
        fechaIngreso: [''],
        licencia: this.fb.group({
            numero: ['', Validators.required],
            grado: ['', Validators.required],
            fechaVencimiento: ['', Validators.required],
        }),
        certificadoMedico: this.fb.group({
            numero: ['', Validators.required],
            fechaExpedicion: ['', Validators.required],
            fechaVencimiento: ['', Validators.required],
        }),
    });

    constructor() {
        effect(() => {
            const data = this.choferData();
            this.submitted = false;
            this.errorMessage = '';

            this.form.patchValue({
                documentoIdentidad: data.documentoIdentidad || { prefijo: 'V', numero: '' },
                nombreCompleto: data.nombreCompleto || '',
                telefono: data.telefono || '',
                rol: data.rol || 'Chofer',
                fechaIngreso: data.fechaIngreso ? new Date(data.fechaIngreso) : null,
                licencia: {
                    numero: data.licencia?.numero || '',
                    grado: data.licencia?.grado || '',
                    fechaVencimiento: data.licencia?.fechaVencimiento
                        ? new Date(data.licencia.fechaVencimiento)
                        : null,
                },
                certificadoMedico: {
                    numero: data.certificadoMedico?.numero || '',
                    fechaExpedicion: data.certificadoMedico?.fechaExpedicion
                        ? new Date(data.certificadoMedico.fechaExpedicion)
                        : null,
                    fechaVencimiento: data.certificadoMedico?.fechaVencimiento
                        ? new Date(data.certificadoMedico.fechaVencimiento)
                        : null,
                },
            });
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

    save() {
        this.submitted = true;
        this.errorMessage = '';

        if (this.form.invalid) {
            this.errorMessage = 'Complete todos los campos obligatorios marcados con *.';
            return;
        }

        const raw = this.form.getRawValue();

        const choferFinal: Chofer = {
            ...this.choferData(),
            documentoIdentidad: raw.documentoIdentidad,
            nombreCompleto: raw.nombreCompleto,
            telefono: raw.telefono,
            rol: raw.rol,
            fechaIngreso: raw.fechaIngreso ? this.formatDate(raw.fechaIngreso) : '',
            licencia: {
                numero: raw.licencia.numero,
                grado: raw.licencia.grado,
                fechaVencimiento: raw.licencia.fechaVencimiento
                    ? this.formatDate(raw.licencia.fechaVencimiento)
                    : '',
            },
            certificadoMedico: {
                numero: raw.certificadoMedico.numero,
                fechaExpedicion: raw.certificadoMedico.fechaExpedicion
                    ? this.formatDate(raw.certificadoMedico.fechaExpedicion)
                    : '',
                fechaVencimiento: raw.certificadoMedico.fechaVencimiento
                    ? this.formatDate(raw.certificadoMedico.fechaVencimiento)
                    : '',
            },
        };

        this.onSave.emit(choferFinal);
        this.visible.set(false);
    }
}

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

import { Ruta } from '../data/rutas-mock';
import { CHOFERES_MOCK } from '../../choferes/data/choferes-mock';
import { VEHICULOS_MOCK } from '../../vehiculos/data/vehiculos-mock';

@Component({
    selector: 'app-ruta-dialog',
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
    ],
    templateUrl: './ruta-dialog.component.html',
})
export class RutaDialogComponent {
    private fb = inject(FormBuilder);

    visible = model<boolean>(false);
    rutaData = input<Ruta>({} as Ruta);
    onSave = output<Ruta>();

    submitted = false;
    errorMessage = '';

    choferes = CHOFERES_MOCK
        .filter(ch => ch.rol === 'Chofer')
        .map(ch => ({
            label: `${ch.nombreCompleto} (${ch.documentoIdentidad?.prefijo}-${ch.documentoIdentidad?.numero})`,
            value: ch.id!,
            nombreChofer: ch.nombreCompleto!,
        }));

    vehiculos = VEHICULOS_MOCK.map(v => ({
        label: `${v.placa} — ${v.marca} ${v.modelo} (${v.anio})`,
        value: v.id!,
        placaVehiculo: v.placa!,
    }));

    form: FormGroup = this.fb.group({
        codigo: ['', Validators.required],
        idChofer: ['', Validators.required],
        idVehiculo: ['', Validators.required],
        fechaAsignacion: [new Date()],
    });

    constructor() {
        effect(() => {
            const data = this.rutaData();
            this.submitted = false;
            this.errorMessage = '';
            this.form.patchValue({
                codigo: data.codigo || '',
                idChofer: data.idChofer || '',
                idVehiculo: data.idVehiculo || '',
                fechaAsignacion: data.fechaAsignacion ? new Date(data.fechaAsignacion) : new Date(),
            });
        });
    }

    hideDialog() {
        this.visible.set(false);
        this.submitted = false;
        this.errorMessage = '';
    }

    save() {
        this.submitted = true;
        this.errorMessage = '';

        if (this.form.invalid) {
            this.errorMessage = 'Complete todos los campos obligatorios.';
            return;
        }

        const raw = this.form.getRawValue();
        const chofer = this.choferes.find(c => c.value === raw.idChofer);
        const vehiculo = this.vehiculos.find(v => v.value === raw.idVehiculo);

        const rutaFinal: Ruta = {
            ...this.rutaData(),
            codigo: raw.codigo,
            idChofer: raw.idChofer,
            nombreChofer: chofer?.nombreChofer || '',
            idVehiculo: raw.idVehiculo,
            placaVehiculo: vehiculo?.placaVehiculo || '',
            fechaAsignacion: raw.fechaAsignacion ? new Date(raw.fechaAsignacion).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            idsGuias: [],
            estado: 'PENDIENTE',
        };

        this.onSave.emit(rutaFinal);
        this.visible.set(false);
    }
}

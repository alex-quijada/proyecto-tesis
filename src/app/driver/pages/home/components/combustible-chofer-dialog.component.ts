import { Component, model, signal, inject, computed, effect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import {
    ReactiveFormsModule,
    FormBuilder,
    FormGroup,
    Validators,
    AbstractControl,
    ValidationErrors,
} from '@angular/forms';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { FluidModule } from 'primeng/fluid';
import { MessageModule } from 'primeng/message';
import { DividerModule } from 'primeng/divider';

import { DriverStoreService } from '../../../services/driver-store.service';
import {
    TIPOS_COMBUSTIBLE,
    limitesLitrosPorTipo,
} from '@/app/admin/pages/vehiculos/combustible/data/combustible-mock';

@Component({
    selector: 'app-combustible-chofer-dialog',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        DialogModule,
        ButtonModule,
        InputNumberModule,
        SelectModule,
        FluidModule,
        MessageModule,
        DividerModule,
    ],
    templateUrl: './combustible-chofer-dialog.component.html',
})
export class CombustibleChoferDialogComponent {
    private fb = inject(FormBuilder);
    store = inject(DriverStoreService);

    visible = model<boolean>(false);
    submitted = false;
    errorMessage = '';
    guardando = signal(false);

    tiposCombustible = TIPOS_COMBUSTIBLE;

    vehiculos = computed(() => this.store.driverInfo()?.vehiculos ?? []);

    form: FormGroup = this.fb.group({
        idVehiculo: ['', Validators.required],
        tipoCombustible: ['GASOLINA_95', Validators.required],
        litrosCargados: [null, [Validators.required]],
        costoPorLitro: [null, [Validators.required, Validators.min(0)]],
        tasaBs: [null, [Validators.required, Validators.min(0)]],
    });

    get vehiculoSelectList() {
        return this.vehiculos().map((v) => ({
            label: `${v.placa} — ${v.marca} ${v.modelo}`.trim(),
            value: v.id,
        }));
    }

    /** Límites de litros según el vehículo seleccionado. */
    get limitesLitros(): { min: number; max: number } {
        const idVehiculo = this.form.get('idVehiculo')?.value;
        const vehiculo = this.vehiculos().find((v) => v.id === idVehiculo);
        return limitesLitrosPorTipo(vehiculo?.tipo);
    }

    get costoTotalUsd(): number {
        const litros = this.form.get('litrosCargados')?.value ?? 0;
        const precio = this.form.get('costoPorLitro')?.value ?? 0;
        return litros * precio;
    }

    get costoTotalBs(): number {
        const tasa = this.form.get('tasaBs')?.value ?? 0;
        return this.costoTotalUsd * tasa;
    }

    constructor() {
        const litros = this.form.get('litrosCargados');
        if (litros) litros.setValidators([Validators.required, this.litrosValidator()]);
        this.form
            .get('idVehiculo')
            ?.valueChanges.pipe(takeUntilDestroyed())
            .subscribe(() => {
                litros?.updateValueAndValidity();
            });
        effect(() => {
            if (this.visible()) this.resetForm();
        });
    }

    /** Valida que los litros estén dentro del rango del tipo de vehículo. */
    private litrosValidator() {
        return (control: AbstractControl): ValidationErrors | null => {
            const idVehiculo = this.form.get('idVehiculo')?.value;
            const vehiculo = this.vehiculos().find((v) => v.id === idVehiculo);
            const { min, max } = limitesLitrosPorTipo(vehiculo?.tipo);
            const valor = control.value;
            if (valor === null || valor === undefined || valor === '') return null;
            if (valor < min) return { minLitros: { min, actual: valor } };
            if (valor > max) return { maxLitros: { max, actual: valor } };
            return null;
        };
    }

    private resetForm() {
        this.submitted = false;
        this.errorMessage = '';
        const principal = this.store.vehiculoPrincipal();
        this.form.reset({
            idVehiculo: principal?.id || this.vehiculos()[0]?.id || '',
            tipoCombustible: 'GASOLINA_95',
            litrosCargados: null,
            costoPorLitro: null,
            tasaBs: null,
        });
    }

    open() {
        this.resetForm();
        this.visible.set(true);
    }

    hideDialog() {
        this.visible.set(false);
        this.submitted = false;
        this.errorMessage = '';
    }

    async save() {
        this.submitted = true;
        this.errorMessage = '';
        this.form.markAllAsTouched();
        this.guardando.set(true);
        try {
            if (this.form.invalid) {
                const litrosErr = this.form.get('litrosCargados')?.errors;
                if (litrosErr?.['maxLitros']) {
                    this.errorMessage = `La cantidad supera la capacidad del vehículo (máximo ${litrosErr['maxLitros'].max} L).`;
                } else if (litrosErr?.['minLitros']) {
                    this.errorMessage = `La cantidad es demasiado pequeña (mínimo ${litrosErr['minLitros'].min} L).`;
                } else {
                    this.errorMessage = 'Complete todos los campos obligatorios.';
                }
                return;
            }

            const raw = this.form.getRawValue();
            await this.store.registrarCargaCombustible({
                idVehiculo: raw.idVehiculo,
                tipoCombustible: raw.tipoCombustible,
                litros: raw.litrosCargados,
                costoPorLitro: raw.costoPorLitro,
                tasaBs: raw.tasaBs,
            });

            this.visible.set(false);
        } catch (err: any) {
            this.errorMessage = err?.message || 'No se pudo registrar la carga de combustible.';
        } finally {
            this.guardando.set(false);
        }
    }
}

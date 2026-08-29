import { Component, input, output, model, effect, inject, OnInit } from '@angular/core';
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
import { DatePickerModule } from 'primeng/datepicker';
import { DividerModule } from 'primeng/divider';

import {
    CargaCombustible,
    TIPOS_COMBUSTIBLE,
    limitesLitrosPorTipo,
} from '../data/combustible-mock';
import { VehiculoService } from '../../service/vehiculo.service';
import { TanqueGaugeComponent } from './tanque-gauge.component';

@Component({
    selector: 'app-combustible-dialog',
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
        DatePickerModule,
        DividerModule,
        TanqueGaugeComponent,
    ],
    templateUrl: './combustible-dialog.component.html',
})
export class CombustibleDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private vehiculoService = inject(VehiculoService);

    visible = model<boolean>(false);
    cargaData = input<CargaCombustible>({} as CargaCombustible);
    onSave = output<CargaCombustible>();

    submitted = false;
    errorMessage = '';

    tiposCombustible = TIPOS_COMBUSTIBLE;
    vehiculos: {
        id: string;
        placa: string;
        label: string;
        capacidadTanque: number;
        tipo: string;
    }[] = [];
    cargandoVehiculos = true;

    form: FormGroup = this.fb.group({
        idVehiculo: ['', Validators.required],
        fecha: ['', Validators.required],
        tipoCombustible: ['GASOLINA_95', Validators.required],
        nivelTanqueAntes: [0.25, Validators.required],
        nivelTanqueDespues: [1, Validators.required],
        litrosCargados: [null, [Validators.required]],
        costoPorLitro: [null, [Validators.required, Validators.min(0)]],
        costoTotal: [{ value: 0, disabled: true }],
        tasaBs: [null, [Validators.required, Validators.min(0)]],
    });

    get vehiculoSelectList() {
        return this.vehiculos.map((v) => ({
            label: `${v.placa} — ${v.label}`,
            value: v.id,
        }));
    }

    get selectedVehiculo() {
        const id = this.form.get('idVehiculo')?.value;
        return this.vehiculos.find((v) => v.id === id);
    }

    /** Límites de litros según el vehículo seleccionado. */
    get limitesLitros(): { min: number; max: number } {
        return limitesLitrosPorTipo(this.selectedVehiculo?.tipo);
    }

    /** Capacidad del tanque (L) según el tipo del vehículo seleccionado. */
    get capacidadTanque(): number {
        return limitesLitrosPorTipo(this.selectedVehiculo?.tipo).max;
    }

    async ngOnInit() {
        try {
            const reales = await this.vehiculoService.obtenerVehiculos();
            this.vehiculos = reales.map((v) => ({
                id: v.id_vehiculo || v.id || '',
                placa: v.placa || '',
                label: `${v.marca || ''} ${v.modelo || ''} (${v.anio || ''})`.trim(),
                capacidadTanque: 0,
                tipo: v.tipo || '',
            }));
        } catch {
            this.vehiculos = [];
        } finally {
            this.cargandoVehiculos = false;
        }
    }

    private recalcularCostoTotal() {
        const litros = this.form.get('litrosCargados')?.value ?? 0;
        const precio = this.form.get('costoPorLitro')?.value ?? 0;
        const total = litros * precio;
        this.form.get('costoTotal')?.setValue(total);
    }

    /** Recalcula el nivel "después" según antes + litros / capacidad del tanque. */
    private recalcularDespues() {
        const antes = this.form.get('nivelTanqueAntes')?.value ?? 0;
        const litros = this.form.get('litrosCargados')?.value ?? 0;
        const cap = this.capacidadTanque;
        const despues = cap > 0 ? Math.max(0, Math.min(1, antes + litros / cap)) : antes;
        this.form.get('nivelTanqueDespues')?.setValue(despues);
    }

    get costoTotalBss(): number {
        const total = this.form.get('costoTotal')?.value ?? 0;
        const tasa = this.form.get('tasaBs')?.value ?? 0;
        return total * tasa;
    }

    /** Actualiza el nivel "antes" desde el medidor y reconcilia el "después". */
    setNivel(campo: 'nivelTanqueAntes' | 'nivelTanqueDespues', valor: number) {
        this.form.get(campo)?.setValue(valor);
        this.recalcularDespues();
    }

    onLitrosChange() {
        this.recalcularCostoTotal();
        this.recalcularDespues();
    }

    onPrecioChange() {
        this.recalcularCostoTotal();
    }

    /** Valida litros: rango del tipo de vehículo y no exceder la capacidad restante. */
    private litrosValidator() {
        return (control: AbstractControl): ValidationErrors | null => {
            const idVehiculo = this.form.get('idVehiculo')?.value;
            const vehiculo = this.vehiculos.find((v) => v.id === idVehiculo);
            const { min, max } = limitesLitrosPorTipo(vehiculo?.tipo);
            const antes = this.form.get('nivelTanqueAntes')?.value ?? 0;
            const restante = (1 - antes) * max;
            const valor = control.value;
            if (valor === null || valor === undefined || valor === '') return null;
            if (valor < min) return { minLitros: { min, actual: valor } };
            if (valor > max) return { maxLitros: { max, actual: valor } };
            if (valor > restante) return { excedeTanque: { restante } };
            return null;
        };
    }

    constructor() {
        const litros = this.form.get('litrosCargados');
        if (litros) litros.setValidators([Validators.required, this.litrosValidator()]);
        this.form.get('idVehiculo')?.valueChanges.subscribe(() => {
            litros?.updateValueAndValidity();
            this.recalcularDespues();
        });
        this.form.get('nivelTanqueAntes')?.valueChanges.subscribe(() => {
            litros?.updateValueAndValidity();
        });
        effect(() => {
            const data = this.cargaData();
            this.submitted = false;
            this.errorMessage = '';

            if (data && data.id) {
                this.form.patchValue({
                    idVehiculo: data.idVehiculo || '',
                    fecha: data.fecha ? new Date(data.fecha) : null,
                    tipoCombustible: data.tipoCombustible || 'GASOLINA_95',
                    nivelTanqueAntes: data.nivelTanqueAntes ?? 0.25,
                    nivelTanqueDespues: data.nivelTanqueDespues ?? 1,
                    litrosCargados: data.litrosCargados || null,
                    costoPorLitro: data.costoPorLitro || null,
                    tasaBs: data.tasaBs || null,
                });
                this.recalcularCostoTotal();
                this.recalcularDespues();
            } else {
                this.form.reset({
                    idVehiculo: '',
                    fecha: null,
                    tipoCombustible: 'GASOLINA_95',
                    nivelTanqueAntes: 0.25,
                    nivelTanqueDespues: 1,
                    litrosCargados: null,
                    costoPorLitro: null,
                    tasaBs: null,
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

    save() {
        this.submitted = true;
        this.errorMessage = '';

        if (this.form.invalid) {
            const litrosErr = this.form.get('litrosCargados')?.errors;
            if (litrosErr?.['maxLitros']) {
                this.errorMessage = `La cantidad supera la capacidad del vehículo (máximo ${litrosErr['maxLitros'].max} L).`;
            } else if (litrosErr?.['excedeTanque']) {
                this.errorMessage = `La cantidad excede el espacio restante del tanque (máximo ${litrosErr['excedeTanque'].restante.toFixed(1)} L).`;
            } else if (litrosErr?.['minLitros']) {
                this.errorMessage = `La cantidad es demasiado pequeña (mínimo ${litrosErr['minLitros'].min} L).`;
            } else {
                this.errorMessage = 'Complete todos los campos obligatorios.';
            }
            return;
        }

        const raw = this.form.getRawValue();
        const vehiculo = this.vehiculos.find((v) => v.id === raw.idVehiculo);

        const cargaFinal: CargaCombustible = {
            ...this.cargaData(),
            idVehiculo: raw.idVehiculo,
            placaVehiculo: vehiculo?.placa || '',
            vehiculoDesc: vehiculo?.label || '',
            fecha: this.formatDate(raw.fecha),
            tipoCombustible: raw.tipoCombustible,
            nivelTanqueAntes: raw.nivelTanqueAntes,
            nivelTanqueDespues: raw.nivelTanqueDespues,
            litrosCargados: raw.litrosCargados,
            costoPorLitro: raw.costoPorLitro,
            costoTotal: raw.litrosCargados * raw.costoPorLitro,
            tasaBs: raw.tasaBs || 0,
            costoTotalBss: raw.tasaBs ? raw.litrosCargados * raw.costoPorLitro * raw.tasaBs : 0,
        };

        this.onSave.emit(cargaFinal);
        this.visible.set(false);
    }
}

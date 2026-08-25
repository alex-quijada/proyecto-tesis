import { Component, input, output, model, effect, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { FluidModule } from 'primeng/fluid';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { DatePickerModule } from 'primeng/datepicker';
import { DividerModule } from 'primeng/divider';

import {
    CargaCombustible,
    TIPOS_COMBUSTIBLE,
    METODOS_CALCULO,
    NIVELES_TANQUE,
} from '../data/combustible-mock';
import { VehiculoService } from '../../service/vehiculo.service';

@Component({
    selector: 'app-combustible-dialog',
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
        DatePickerModule,
        DividerModule,
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
    metodos = METODOS_CALCULO;
    nivelesTanque = NIVELES_TANQUE;
    vehiculos: { id: string; placa: string; label: string; capacidadTanque: number }[] = [];
    cargandoVehiculos = true;

    form: FormGroup = this.fb.group({
        idVehiculo: ['', Validators.required],
        fecha: ['', Validators.required],
        tipoCombustible: ['GASOLINA_95', Validators.required],
        metodoCalculo: ['TANQUE', Validators.required],
        kilometraje: [0],
        nivelTanqueAntes: [0.25, Validators.required],
        nivelTanqueDespues: [1, Validators.required],
        litrosCargados: [0, [Validators.required, Validators.min(0.1)]],
        costoPorLitro: [0, [Validators.required, Validators.min(0)]],
        costoTotal: [{ value: 0, disabled: true }],
        costoTotalBss: [0, [Validators.required, Validators.min(0)]],
        estacionServicio: [''],
        observaciones: [''],
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

    async ngOnInit() {
        try {
            const reales = await this.vehiculoService.obtenerVehiculos();
            this.vehiculos = reales.map((v) => ({
                id: v.id_vehiculo || v.id || '',
                placa: v.placa || '',
                label: `${v.marca || ''} ${v.modelo || ''} (${v.anio || ''})`.trim(),
                capacidadTanque: 0,
            }));
        } catch {
            this.vehiculos = [];
        } finally {
            this.cargandoVehiculos = false;
        }
    }

    get nivelAntesValue(): number {
        return this.form.get('nivelTanqueAntes')?.value ?? 0;
    }

    get nivelDespuesValue(): number {
        return this.form.get('nivelTanqueDespues')?.value ?? 1;
    }

    get metodoCalculoValue(): string {
        return this.form.get('metodoCalculo')?.value ?? 'TANQUE';
    }

    get metodoDescripcion(): string {
        const m = METODOS_CALCULO.find((x) => x.value === this.metodoCalculoValue);
        return m?.desc ?? '';
    }

    private recalcularCostoTotal() {
        const litros = this.form.get('litrosCargados')?.value ?? 0;
        const precio = this.form.get('costoPorLitro')?.value ?? 0;
        const total = litros * precio;
        this.form.get('costoTotal')?.setValue(total);
    }

    onLitrosChange() {
        this.recalcularCostoTotal();
    }

    onPrecioChange() {
        this.recalcularCostoTotal();
    }

    constructor() {
        effect(() => {
            const data = this.cargaData();
            this.submitted = false;
            this.errorMessage = '';

            if (data && data.id) {
                this.form.patchValue({
                    idVehiculo: data.idVehiculo || '',
                    fecha: data.fecha ? new Date(data.fecha) : null,
                    tipoCombustible: data.tipoCombustible || 'GASOLINA_95',
                    metodoCalculo: data.metodoCalculo || 'TANQUE',
                    kilometraje: data.kilometraje || 0,
                    nivelTanqueAntes: data.nivelTanqueAntes ?? 0.25,
                    nivelTanqueDespues: data.nivelTanqueDespues ?? 1,
                    litrosCargados: data.litrosCargados || 0,
                    costoPorLitro: data.costoPorLitro || 0,
                    costoTotalBss: data.costoTotalBss || 0,
                    estacionServicio: data.estacionServicio || '',
                    observaciones: data.observaciones || '',
                });
                this.recalcularCostoTotal();
            } else {
                this.form.reset({
                    idVehiculo: '',
                    fecha: null,
                    tipoCombustible: 'GASOLINA_95',
                    metodoCalculo: 'TANQUE',
                    kilometraje: 0,
                    nivelTanqueAntes: 0.25,
                    nivelTanqueDespues: 1,
                    litrosCargados: 0,
                    costoPorLitro: 0,
                    costoTotalBss: 0,
                    estacionServicio: '',
                    observaciones: '',
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
            this.errorMessage = 'Complete todos los campos obligatorios.';
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
            metodoCalculo: raw.metodoCalculo,
            kilometraje: raw.metodoCalculo === 'ODOMETRO' ? raw.kilometraje : undefined,
            nivelTanqueAntes: raw.nivelTanqueAntes,
            nivelTanqueDespues: raw.nivelTanqueDespues,
            litrosCargados: raw.litrosCargados,
            costoPorLitro: raw.costoPorLitro,
            costoTotal: raw.litrosCargados * raw.costoPorLitro,
            costoTotalBss: raw.costoTotalBss || 0,
            estacionServicio: raw.estacionServicio || undefined,
            observaciones: raw.observaciones || undefined,
        };

        this.onSave.emit(cargaFinal);
        this.visible.set(false);
    }
}

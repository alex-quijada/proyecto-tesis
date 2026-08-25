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
    Mantenimiento,
    TIPOS_MANTENIMIENTO,
    ESTADOS_MANTENIMIENTO,
} from '../data/mantenimiento-mock';
import { Vehiculo } from '../../data/vehiculos-mock';
import { VehiculoService } from '../../service/vehiculo.service';

@Component({
    selector: 'app-mantenimiento-dialog',
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
    templateUrl: './mantenimiento-dialog.component.html',
})
export class MantenimientoDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private vehiculoService = inject(VehiculoService);

    visible = model<boolean>(false);
    mantenimientoData = input<Mantenimiento>({} as Mantenimiento);
    onSave = output<Mantenimiento>();

    submitted = false;
    errorMessage = '';

    tipos = TIPOS_MANTENIMIENTO;
    estados = ESTADOS_MANTENIMIENTO;
    vehiculos: Vehiculo[] = [];
    cargandoVehiculos = true;

    form: FormGroup = this.fb.group({
        idVehiculo: ['', Validators.required],
        tipo: ['PREVENTIVO', Validators.required],
        fechaProgramada: ['', Validators.required],
        fechaRealizado: [''],
        kilometraje: [0, [Validators.required, Validators.min(0)]],
        descripcion: ['', Validators.required],
        responsable: ['', Validators.required],
        costo: [0, [Validators.required, Validators.min(0)]],
        costoBss: [0, [Validators.required, Validators.min(0)]],
        proximoKm: [0, [Validators.required, Validators.min(0)]],
        proximaFecha: [''],
        estado: ['PROGRAMADO', Validators.required],
    });

    constructor() {
        effect(() => {
            const data = this.mantenimientoData();
            this.submitted = false;
            this.errorMessage = '';

            if (data && data.id) {
                this.form.patchValue({
                    idVehiculo: data.idVehiculo || '',
                    tipo: data.tipo || 'PREVENTIVO',
                    fechaProgramada: data.fechaProgramada ? new Date(data.fechaProgramada) : null,
                    fechaRealizado: data.fechaRealizado ? new Date(data.fechaRealizado) : null,
                    kilometraje: data.kilometraje || 0,
                    descripcion: data.descripcion || '',
                    responsable: data.responsable || '',
                    costo: data.costo || 0,
                    costoBss: data.costoBss || 0,
                    proximoKm: data.proximoKm || 0,
                    proximaFecha: data.proximaFecha ? new Date(data.proximaFecha) : null,
                    estado: data.estado || 'PROGRAMADO',
                });
            } else {
                this.form.reset({
                    idVehiculo: '',
                    tipo: 'PREVENTIVO',
                    fechaProgramada: null,
                    fechaRealizado: null,
                    kilometraje: 0,
                    descripcion: '',
                    responsable: '',
                    costo: 0,
                    costoBss: 0,
                    proximoKm: 0,
                    proximaFecha: null,
                    estado: 'PROGRAMADO',
                });
            }
        });
    }

    get vehiculoSelectList() {
        return this.vehiculos.map((v) => ({
            label: `${v.placa} — ${v.marca} ${v.modelo} (${v.anio})`,
            value: v.id_vehiculo || v.id || '',
        }));
    }

    get selectedVehiculo(): Vehiculo | undefined {
        const id = this.form.get('idVehiculo')?.value;
        return this.vehiculos.find((v) => (v.id_vehiculo || v.id) === id);
    }

    async ngOnInit() {
        try {
            this.vehiculos = await this.vehiculoService.obtenerVehiculos();
        } catch {
            this.vehiculos = [];
        } finally {
            this.cargandoVehiculos = false;
        }
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
        const vehiculo = this.vehiculos.find((v) => v.id === raw.idVehiculo);

        const mantenimientoFinal: Mantenimiento = {
            ...this.mantenimientoData(),
            idVehiculo: raw.idVehiculo,
            placaVehiculo: vehiculo?.placa || '',
            vehiculoDesc: vehiculo ? `${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.anio})` : '',
            tipo: raw.tipo,
            fechaProgramada: this.formatDate(raw.fechaProgramada),
            fechaRealizado: raw.fechaRealizado ? this.formatDate(raw.fechaRealizado) : undefined,
            kilometraje: raw.kilometraje,
            descripcion: raw.descripcion,
            responsable: raw.responsable,
            costo: raw.costo,
            costoBss: raw.costoBss || 0,
            proximoKm: raw.proximoKm,
            proximaFecha: raw.proximaFecha ? this.formatDate(raw.proximaFecha) : undefined,
            estado: raw.estado,
        };

        this.onSave.emit(mantenimientoFinal);
        this.visible.set(false);
    }
}

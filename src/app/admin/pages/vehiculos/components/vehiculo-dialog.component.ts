import { Component, input, output, model, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { FluidModule } from 'primeng/fluid';
import { MessageModule } from 'primeng/message';
import { DatePickerModule } from 'primeng/datepicker';
import { DividerModule } from 'primeng/divider';

import { Vehiculo, TIPOS_COBERTURA } from '../data/vehiculos-mock';

@Component({
    selector: 'app-vehiculo-dialog',
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
        DatePickerModule,
        DividerModule,
    ],
    templateUrl: './vehiculo-dialog.component.html'
})
export class VehiculoDialogComponent {
    private fb = inject(FormBuilder);

    visible = model<boolean>(false);
    vehiculoData = input<Vehiculo>({});
    onSave = output<Vehiculo>();

    submitted = false;
    errorMessage = '';

    tiposVehiculo = [
        { label: 'Automóvil', value: 'CARRO' },
        { label: 'Motocicleta', value: 'MOTO' },
        { label: 'Camión de Carga', value: 'CAMION' },
    ];

    tiposCaja = [
        { label: 'Caja Seca', value: 'SECA' },
        { label: 'Plataforma Abierta', value: 'PLATAFORMA' },
        { label: 'Refrigerados', value: 'REFRIGERADO' },
        { label: 'Articulado', value: 'ARTICULADO' },
    ];

    estados = [
        { label: 'Operativo', value: 'OPERATIVO' },
        { label: 'En Mantenimiento', value: 'MANTENIMIENTO' },
        { label: 'Inactivo', value: 'INACTIVO' },
    ];

    tiposCobertura = TIPOS_COBERTURA;

    form: FormGroup = this.fb.group({
        tipo: ['CARRO', Validators.required],
        placa: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9\s-]{6,9}$/)]],
        marca: ['', Validators.required],
        modelo: ['', Validators.required],
        anio: [new Date().getFullYear(), [Validators.required, Validators.min(1950), Validators.max(new Date().getFullYear() + 1)]],
        imagen: [''],
        capacidadPallets: [0, Validators.required],
        pesoMaximo: [0, [Validators.required, Validators.min(0)]],
        tipoCaja: ['SECA', Validators.required],
        estado: ['OPERATIVO', Validators.required],
        seguro: this.fb.group({
            poliza: ['', Validators.required],
            empresa: ['', Validators.required],
            tipoCobertura: ['', Validators.required],
            fechaVencimiento: ['', Validators.required],
        }),
        documentosLegales: this.fb.group({
            numeroRegistro: ['', Validators.required],
            numeroContrato: [''],
            empresaContrato: [''],
            vencimientoContrato: [''],
            revisionTecnicaNumero: [''],
            revisionTecnicaVencimiento: [''],
        }),
    });

    constructor() {
        effect(() => {
            const data = this.vehiculoData();
            this.submitted = false;
            this.errorMessage = '';

            if (data && data.id) {
                this.form.patchValue({
                    tipo: data.tipo || 'CARRO',
                    placa: data.placa || '',
                    marca: data.marca || '',
                    modelo: data.modelo || '',
                    anio: data.anio || new Date().getFullYear(),
                    imagen: data.imagen || '',
                    capacidadPallets: data.capacidadPallets ?? 0,
                    pesoMaximo: data.pesoMaximo ?? 0,
                    tipoCaja: data.tipoCaja || 'SECA',
                    estado: data.estado || 'OPERATIVO',
                    seguro: {
                        poliza: data.seguro?.poliza || '',
                        empresa: data.seguro?.empresa || '',
                        tipoCobertura: data.seguro?.tipoCobertura || '',
                        fechaVencimiento: data.seguro?.fechaVencimiento ? new Date(data.seguro.fechaVencimiento) : null,
                    },
                    documentosLegales: {
                        numeroRegistro: data.documentosLegales?.numeroRegistro || '',
                        numeroContrato: data.documentosLegales?.numeroContrato || '',
                        empresaContrato: data.documentosLegales?.empresaContrato || '',
                        vencimientoContrato: data.documentosLegales?.vencimientoContrato ? new Date(data.documentosLegales.vencimientoContrato) : null,
                        revisionTecnicaNumero: data.documentosLegales?.revisionTecnicaNumero || '',
                        revisionTecnicaVencimiento: data.documentosLegales?.revisionTecnicaVencimiento ? new Date(data.documentosLegales.revisionTecnicaVencimiento) : null,
                    },
                });
            } else {
                this.form.reset({
                    tipo: 'CARRO',
                    placa: '',
                    marca: '',
                    modelo: '',
                    anio: new Date().getFullYear(),
                    imagen: '',
                    capacidadPallets: 0,
                    pesoMaximo: 0,
                    tipoCaja: 'SECA',
                    estado: 'OPERATIVO',
                });
            }
            this.onTipoVehiculoChange();
        });
    }

    onTipoVehiculoChange() {
        const tipo = this.form.get('tipo')?.value;
        if (tipo === 'CARRO' || tipo === 'MOTO') {
            this.form.get('capacidadPallets')?.setValue(0);
            this.form.get('tipoCaja')?.setValue('SECA');
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

    validarPlaca(): boolean {
        const placaRaw = this.form.get('placa')?.value || '';
        const placa = placaRaw.replace(/[\s-]/g, '').toUpperCase();
        this.form.get('placa')?.setValue(placa);

        if (placa.length !== 7) {
            this.errorMessage = 'La placa debe tener exactamente 7 caracteres (ej: AB123CD).';
            return false;
        }

        const letras = (placa.match(/[A-Z]/g) || []).length;
        const numeros = (placa.match(/[0-9]/g) || []).length;

        if (letras !== 4 || numeros !== 3) {
            this.errorMessage = 'La placa venezolana debe contener 4 letras y 3 números (ej: AB123CD).';
            return false;
        }

        return true;
    }

    validarPesos(): boolean {
        const tipo = this.form.get('tipo')?.value;
        const peso = this.form.get('pesoMaximo')?.value;

        if (tipo === 'MOTO' && peso > 350) {
            this.errorMessage = 'El peso máximo para una motocicleta no debería exceder los 350 Kg.';
            return false;
        }
        if (tipo === 'CARRO' && peso > 2500) {
            this.errorMessage = 'El peso máximo para un automóvil/pickup no debería exceder los 2,500 Kg.';
            return false;
        }

        return true;
    }

    save() {
        this.submitted = true;
        this.errorMessage = '';

        if (this.form.invalid) {
            this.errorMessage = 'Complete todos los campos obligatorios marcados con *.';
            return;
        }

        if (!this.validarPlaca()) return;
        if (!this.validarPesos()) return;

        const raw = this.form.getRawValue();

        const vehiculoFinal: Vehiculo = {
            ...this.vehiculoData(),
            tipo: raw.tipo,
            placa: raw.placa.toUpperCase(),
            marca: raw.marca,
            modelo: raw.modelo,
            anio: raw.anio,
            imagen: raw.imagen || 'default-' + (raw.tipo?.toLowerCase() || 'camion'),
            capacidadPallets: raw.capacidadPallets,
            tipoCaja: raw.tipoCaja,
            pesoMaximo: raw.pesoMaximo,
            estado: raw.estado,
            seguro: {
                poliza: raw.seguro.poliza,
                empresa: raw.seguro.empresa,
                tipoCobertura: raw.seguro.tipoCobertura,
                fechaVencimiento: raw.seguro.fechaVencimiento ? this.formatDate(raw.seguro.fechaVencimiento) : '',
            },
            documentosLegales: {
                numeroRegistro: raw.documentosLegales.numeroRegistro,
                numeroContrato: raw.documentosLegales.numeroContrato || undefined,
                empresaContrato: raw.documentosLegales.empresaContrato || undefined,
                vencimientoContrato: raw.documentosLegales.vencimientoContrato ? this.formatDate(raw.documentosLegales.vencimientoContrato) : undefined,
                revisionTecnicaNumero: raw.documentosLegales.revisionTecnicaNumero || undefined,
                revisionTecnicaVencimiento: raw.documentosLegales.revisionTecnicaVencimiento ? this.formatDate(raw.documentosLegales.revisionTecnicaVencimiento) : undefined,
            },
        };

        this.onSave.emit(vehiculoFinal);
        this.visible.set(false);
    }
}

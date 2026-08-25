import {
    Component,
    input,
    output,
    model,
    effect,
    inject,
    signal,
    computed,
    DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, JsonPipe } from '@angular/common';
import { NotificationService } from '@/app/services/notification.service';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { FluidModule } from 'primeng/fluid';
import { MessageModule } from 'primeng/message';
import { DividerModule } from 'primeng/divider';

import { Vehiculo } from '../../data/vehiculos-mock';
import { VehiculoService } from '../../service/vehiculo.service';

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
        DividerModule,
    ],
    templateUrl: './vehiculo-dialog.component.html',
})
export class VehiculoDialogComponent {
    private fb = inject(FormBuilder);
    private vehiculoService = inject(VehiculoService);
    private notif = inject(NotificationService);

    visible = model<boolean>(false);
    vehiculoData = input<Vehiculo>({});
    onSave = output<Vehiculo>();

    submitted = false;
    errorMessage = signal('');
    loading = signal(false);

    anioMaximo = new Date().getFullYear() + 1;

    paletsMaximo = computed(() => {
        const tipoCaja = (this.form.get('tipoCaja')?.value || '').toUpperCase();
        return tipoCaja === 'PLATAFORMA' ? 30 : 20;
    });

    tipoCajaEsArticulado = computed(
        () => (this.form.get('tipoCaja')?.value || '').toUpperCase() === 'ARTICULADO',
    );

    tiposVehiculo: { label: string; value: string }[] = [];
    tiposCaja: { label: string; value: string }[] = [];
    estados: { label: string; value: string }[] = [];

    esCamion = signal(false);

    form: FormGroup = this.fb.group({
        tipo: ['CARRO', Validators.required],
        placa: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9\s-]{6,9}$/)]],
        marca: ['', Validators.required],
        modelo: ['', Validators.required],
        anio: [
            new Date().getFullYear(),
            [Validators.required, Validators.min(1950), Validators.max(this.anioMaximo)],
        ],
        capacidadPallets: [0, Validators.required],
        pesoMaximo: [0, [Validators.required, Validators.min(0), Validators.max(45000)]],
        tipoCaja: ['SECA', Validators.required],
        estado: ['OPERATIVO', Validators.required],
    });

    private dr = inject(DestroyRef);

    constructor() {
        effect(() => {
            const data = this.vehiculoData();
            this.submitted = false;
            this.errorMessage.set('');
            this.form.markAsPristine();
            this.form.markAsUntouched();

            if (data && (data.id_vehiculo || data.id)) {
                this.form.patchValue({
                    tipo: data.tipo || 'CARRO',
                    placa: data.placa || '',
                    marca: data.marca || '',
                    modelo: data.modelo || '',
                    anio: data.anio || new Date().getFullYear(),
                    capacidadPallets: data.capacidadPallets ?? 0,
                    pesoMaximo: data.pesoMaximo ?? 0,
                    tipoCaja: data.tipoCaja || 'SECA',
                    estado: data.estado || 'OPERATIVO',
                });
            } else {
                this.form.reset({
                    tipo: 'CARRO',
                    placa: '',
                    marca: '',
                    modelo: '',
                    anio: new Date().getFullYear(),
                    capacidadPallets: 0,
                    pesoMaximo: 0,
                    tipoCaja: 'SECA',
                    estado: 'OPERATIVO',
                });
                if (data?.placa) {
                    this.form.patchValue({ placa: data.placa });
                }
                if (data?.marca) {
                    this.form.patchValue({ marca: data.marca });
                }
                if (data?.modelo) {
                    this.form.patchValue({ modelo: data.modelo });
                }
                if (data?.pesoMaximo) {
                    this.form.patchValue({ pesoMaximo: data.pesoMaximo });
                }
            }

            this.actualizarValidacionPallets();
        });

        effect(() => {
            if (this.visible()) {
                this.cargarCatalogos();
            }
        });

        this.form
            .get('tipo')
            ?.valueChanges.pipe(takeUntilDestroyed(this.dr))
            .subscribe((tipo) => {
                const esCamion = (tipo || '').toUpperCase() === 'CAMION';
                this.esCamion.set(esCamion);
                if (!esCamion) {
                    this.form.get('capacidadPallets')?.setValue(0);
                    this.form.get('tipoCaja')?.setValue('SECA');
                }
            });

        this.form
            .get('tipoCaja')
            ?.valueChanges.pipe(takeUntilDestroyed(this.dr))
            .subscribe(() => {
                this.actualizarValidacionPallets();
            });
    }

    private actualizarValidacionPallets() {
        const pallets = this.form.get('capacidadPallets');
        if (!pallets) return;

        if (this.tipoCajaEsArticulado()) {
            pallets.setValue(0, { emitEvent: false });
            pallets.disable({ emitEvent: false });
            pallets.clearValidators();
            pallets.setValidators([Validators.required, Validators.max(0)]);
        } else {
            pallets.enable({ emitEvent: false });
            pallets.setValidators([
                Validators.required,
                Validators.min(0),
                Validators.max(this.paletsMaximo()),
            ]);
        }
        pallets.updateValueAndValidity();
    }

    private async cargarCatalogos() {
        try {
            const catalogos = await this.vehiculoService.obtenerCatalogosVehiculos();
            this.tiposVehiculo = catalogos.tiposVehiculo;
            this.tiposCaja = catalogos.tiposCaja;
            this.estados = catalogos.estados;
        } catch (error: any) {
            console.error('Error al cargar catálogos:', error);
            this.tiposVehiculo = [
                { label: 'Automóvil', value: 'CARRO' },
                { label: 'Motocicleta', value: 'MOTO' },
                { label: 'Camión de Carga', value: 'CAMION' },
            ];
            this.tiposCaja = [
                { label: 'Caja Seca', value: 'SECA' },
                { label: 'Plataforma Abierta', value: 'PLATAFORMA' },
                { label: 'Refrigerados', value: 'REFRIGERADO' },
                { label: 'Articulado', value: 'ARTICULADO' },
            ];
            this.estados = [
                { label: 'Operativo', value: 'OPERATIVO' },
                { label: 'En Mantenimiento', value: 'MANTENIMIENTO' },
                { label: 'Inactivo', value: 'INACTIVO' },
            ];
        }
    }

    hideDialog() {
        this.visible.set(false);
        this.submitted = false;
        this.errorMessage.set('');
        this.form.markAsPristine();
        this.form.markAsUntouched();
    }

    validarPlaca(): boolean {
        const placaRaw = this.form.get('placa')?.value || '';
        const placa = placaRaw.replace(/[\s-]/g, '').toUpperCase();
        this.form.get('placa')?.setValue(placa);

        if (placa.length !== 7) {
            this.errorMessage.set('La placa debe tener exactamente 7 caracteres (ej: AB123CD).');
            return false;
        }

        const letras = (placa.match(/[A-Z]/g) || []).length;
        const numeros = (placa.match(/[0-9]/g) || []).length;

        if (letras !== 4 || numeros !== 3) {
            this.errorMessage.set(
                'La placa venezolana debe contener 4 letras y 3 números (ej: AB123CD).',
            );
            return false;
        }

        return true;
    }

    validarPesos(): boolean {
        const tipo = (this.form.get('tipo')?.value || '').toUpperCase();
        const peso = this.form.get('pesoMaximo')?.value;

        if (tipo === 'MOTO' && peso > 350) {
            this.errorMessage.set(
                'El peso máximo para una motocicleta no debería exceder los 350 Kg.',
            );
            return false;
        }
        if (tipo === 'CARRO' && peso > 2500) {
            this.errorMessage.set(
                'El peso máximo para un automóvil/pickup no debería exceder los 2,500 Kg.',
            );
            return false;
        }

        return true;
    }

    async save() {
        this.submitted = true;
        this.errorMessage.set('');

        if (this.form.invalid) {
            this.errorMessage.set('Corrija los campos señalados en rojo.');
            return;
        }

        if (!this.validarPlaca()) return;
        if (!this.validarPesos()) return;

        const raw = this.form.getRawValue();
        const tipo = (raw.tipo || '').toUpperCase();

        const vehiculoFinal: Vehiculo = {
            ...this.vehiculoData(),
            tipo: raw.tipo,
            placa: raw.placa.toUpperCase(),
            marca: raw.marca,
            modelo: raw.modelo,
            anio: raw.anio,
            capacidadPallets: tipo !== 'CAMION' ? 0 : raw.capacidadPallets,
            tipoCaja: tipo !== 'CAMION' ? 'SECA' : raw.tipoCaja,
            pesoMaximo: raw.pesoMaximo,
            estado: raw.estado,
        };

        this.loading.set(true);
        try {
            const esEdicion = !!(vehiculoFinal.id_vehiculo || vehiculoFinal.id);

            if (esEdicion) {
                await this.vehiculoService.actualizarVehiculo(vehiculoFinal);
                this.notif.add({
                    severity: 'success',
                    summary: 'Actualizado',
                    detail: 'Unidad modificada correctamente',
                    life: 3000,
                });
            } else {
                const nuevoId = await this.vehiculoService.crearVehiculo(vehiculoFinal);
                vehiculoFinal.id_vehiculo = nuevoId;
                vehiculoFinal.id = nuevoId;
                this.notif.add({
                    severity: 'success',
                    summary: 'Registrado',
                    detail: 'Unidad agregada correctamente',
                    life: 3000,
                });
            }

            this.onSave.emit(vehiculoFinal);
            this.visible.set(false);
        } catch (error: any) {
            this.errorMessage.set(error.message || 'Error al procesar la solicitud.');
        } finally {
            this.loading.set(false);
        }
    }
}

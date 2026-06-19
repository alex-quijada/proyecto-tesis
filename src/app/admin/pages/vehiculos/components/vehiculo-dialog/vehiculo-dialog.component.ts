import { Component, input, output, model, effect, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, JsonPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { FluidModule } from 'primeng/fluid';
import { MessageModule } from 'primeng/message';
import { DividerModule } from 'primeng/divider';
import { ToastModule } from 'primeng/toast';
import { FileUploadModule } from 'primeng/fileupload';

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
        ToastModule,
        FileUploadModule,
        JsonPipe,
    ],
    providers: [MessageService],
    templateUrl: './vehiculo-dialog.component.html',
})
export class VehiculoDialogComponent {
    private fb = inject(FormBuilder);
    private vehiculoService = inject(VehiculoService);
    private messageService = inject(MessageService);

    visible = model<boolean>(false);
    vehiculoData = input<Vehiculo>({});
    onSave = output<Vehiculo>();

    submitted = false;
    errorMessage = '';
    loading = false;
    uploadingImage = false;
    uploadedImageUrl: string | undefined = undefined;

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
            [
                Validators.required,
                Validators.min(1950),
                Validators.max(new Date().getFullYear() + 1),
            ],
        ],
        capacidadPallets: [0, Validators.required],
        pesoMaximo: [0, [Validators.required, Validators.min(0)]],
        tipoCaja: ['SECA', Validators.required],
        estado: ['OPERATIVO', Validators.required],
    });

    private dr = inject(DestroyRef);

    constructor() {
        effect(() => {
            const data = this.vehiculoData();
            this.submitted = false;
            this.errorMessage = '';
            this.uploadedImageUrl = data.imagen_url || undefined;

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
            }
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
        this.errorMessage = '';
        this.uploadedImageUrl = undefined;
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
            this.errorMessage =
                'La placa venezolana debe contener 4 letras y 3 números (ej: AB123CD).';
            return false;
        }

        return true;
    }

    validarPesos(): boolean {
        const tipo = (this.form.get('tipo')?.value || '').toUpperCase();
        const peso = this.form.get('pesoMaximo')?.value;

        if (tipo === 'MOTO' && peso > 350) {
            this.errorMessage =
                'El peso máximo para una motocicleta no debería exceder los 350 Kg.';
            return false;
        }
        if (tipo === 'CARRO' && peso > 2500) {
            this.errorMessage =
                'El peso máximo para un automóvil/pickup no debería exceder los 2,500 Kg.';
            return false;
        }

        return true;
    }

    onImageUpload(event: any) {
        const file = event.files?.[0];
        if (!file) return;

        this.uploadingImage = true;
        const tempId = `temp_${Date.now()}`;

        this.vehiculoService
            .subirImagenVehiculo(file, tempId)
            .then((url) => {
                this.uploadedImageUrl = url;
                this.messageService.add({
                    severity: 'success',
                    summary: 'Imagen subida',
                    detail: 'La imagen se ha subido correctamente',
                    life: 3000,
                });
            })
            .catch((error: any) => {
                this.errorMessage = error.message || 'Error al subir la imagen';
            })
            .finally(() => {
                this.uploadingImage = false;
            });
    }

    removeImage() {
        this.uploadedImageUrl = undefined;
    }

    async save() {
        this.submitted = true;
        this.errorMessage = '';

        if (this.form.invalid) {
            this.errorMessage = 'Complete todos los campos obligatorios marcados con *.';
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
            imagen_url: this.uploadedImageUrl,
        };

        this.loading = true;
        try {
            const esEdicion = !!(vehiculoFinal.id_vehiculo || vehiculoFinal.id);

            if (esEdicion) {
                await this.vehiculoService.actualizarVehiculo(vehiculoFinal);
                this.messageService.add({
                    severity: 'success',
                    summary: 'Actualizado',
                    detail: 'Unidad modificada correctamente',
                    life: 3000,
                });
            } else {
                const nuevoId = await this.vehiculoService.crearVehiculo(vehiculoFinal);
                vehiculoFinal.id_vehiculo = nuevoId;
                vehiculoFinal.id = nuevoId;
                this.messageService.add({
                    severity: 'success',
                    summary: 'Registrado',
                    detail: 'Unidad agregada correctamente',
                    life: 3000,
                });
            }

            this.onSave.emit(vehiculoFinal);
            this.visible.set(false);
        } catch (error: any) {
            this.errorMessage = error.message || 'Error al procesar la solicitud.';
        } finally {
            this.loading = false;
        }
    }
}

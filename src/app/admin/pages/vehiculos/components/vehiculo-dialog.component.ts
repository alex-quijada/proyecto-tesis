import { Component, input, output, model, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// PrimeNG v18+
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { FluidModule } from 'primeng/fluid';
import { MessageModule } from 'primeng/message'; // Para mostrar alertas integradas

import { Vehiculo } from '../data/vehiculos-mock';

@Component({
    selector: 'app-vehiculo-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        DialogModule,
        ButtonModule,
        InputTextModule,
        InputNumberModule,
        SelectModule,
        FluidModule,
        MessageModule
    ],
    templateUrl: './vehiculo-dialog.component.html'
})
export class VehiculoDialogComponent {
    visible = model<boolean>(false);
    vehiculoData = input<Vehiculo>({});
    onSave = output<Vehiculo>();

    vehiculo: Vehiculo = {};
    submitted = false;
    errorMessage = ''; // Almacena el texto del error de validación

    tiposVehiculo = [
        { label: 'Automóvil', value: 'CARRO' },
        { label: 'Motocicleta', value: 'MOTO' },
        { label: 'Camión de Carga', value: 'CAMION' }
    ];

    tiposCaja = [
        { label: 'Caja Seca ', value: 'SECA' },
        { label: 'Plataforma Abierta', value: 'PLATAFORMA' },
        { label: 'Refrigerados', value: 'REFRIGERADO' },
        { label: 'Articulado', value: 'ARTICULADO' }
    ];

    estados = [
        { label: 'Operativo', value: 'OPERATIVO' },
        { label: 'En Mantenimiento', value: 'MANTENIMIENTO' },
        { label: 'Inactivo', value: 'INACTIVO' }
    ];

    constructor() {
        effect(() => {
            this.vehiculo = { ...this.vehiculoData() };
            this.submitted = false;
            this.errorMessage = '';
        });
    }

    // Validación automática cuando el usuario cambia el Tipo de Unidad
    onTipoVehiculoChange() {
        if (this.vehiculo.tipo === 'CARRO' || this.vehiculo.tipo === 'MOTO') {
            this.vehiculo.capacidadPallets = 0;
            this.vehiculo.tipoCaja = 'SECA';
        }
    }

    // Evalúa si el formulario cumple con todas tus reglas de negocio
    validarFormulario(): boolean {
        this.errorMessage = '';

        // 1. Validar campos requeridos obligatorios (Todos menos imagen)
        if (!this.vehiculo.tipo || !this.vehiculo.placa?.trim() ||
            !this.vehiculo.marca?.trim() || !this.vehiculo.modelo?.trim() ||
            this.vehiculo.anio === undefined || this.vehiculo.capacidadPallets === undefined ||
            this.vehiculo.pesoMaximo === undefined || !this.vehiculo.tipoCaja || !this.vehiculo.estado) {
            this.errorMessage = 'Por favor, complete todos los campos obligatorios del formulario.';
            return false;
        }

        // Dentro de tu lógica de guardado antes de añadirlo a la lista de 'vehiculos'
        if (!this.vehiculo.imagen || this.vehiculo.imagen.trim() === '') {
            switch (this.vehiculo.tipo) {
                case 'MOTO':
                    // Puedes usar una URL de un vector limpio o una imagen de marcador
                    this.vehiculo.imagen = 'https://primefaces.org/cdn/primeng/images/demo/avatar/ionibowcher.png';
                    // O si prefieres dejarlo marcado para pintar un icono en el HTML:
                    this.vehiculo.imagen = 'default-moto';
                    break;
                case 'CARRO':
                    this.vehiculo.imagen = 'default-carro';
                    break;
                case 'CAMION':
                    this.vehiculo.imagen = 'default-camion';
                    break;
            }
        }
        // 2. Validar Placa Venezolana (Formato actual alfanumérico: 4 letras y 3 números)
        // Remueve espacios o guiones antes de validar para mayor comodidad del usuario
        const placaLimpia = this.vehiculo.placa.replace(/[\s-]/g, '').toUpperCase();
        this.vehiculo.placa = placaLimpia; // Guardamos el formato limpio estandarizado

        // Expresión regular: Busca exactamente 4 letras seguidas de 3 números (Ej: AB123CD o AAAB111 según generación)
        // El patrón venezolano estándar actual suele ser de 4 letras y 3 números distribuidos
        const regexPlacaVe = /^[A-Z0-9]{7}$/;
        const letrasCount = (placaLimpia.match(/[A-Z]/g) || []).length;
        const numerosCount = (placaLimpia.match(/[0-9]/g) || []).length;

        if (!regexPlacaVe.test(placaLimpia) || letrasCount !== 4 || numerosCount !== 3) {
            this.errorMessage = 'La placa no cumple con el formato venezolano válido (Debe contener exactamente 4 letras y 3 números, ej: AB123CD).';
            return false;
        }

        // 3. Validar Año del vehículo (Exactamente 4 dígitos y rango coherente)
        const anioStr = this.vehiculo.anio.toString();
        const anioActual = new Date().getFullYear();
        if (anioStr.length !== 4 || this.vehiculo.anio < 1950 || this.vehiculo.anio > (anioActual + 1)) {
            this.errorMessage = `El año debe ser un número de 4 dígitos válido (Entre 1950 y ${anioActual + 1}).`;
            return false;
        }

        // 4. Validar pesos máximos lógicos para evitar errores de digitación
        if (this.vehiculo.tipo === 'MOTO' && this.vehiculo.pesoMaximo > 350) {
            this.errorMessage = 'El peso máximo para una motocicleta no debería exceder los 350 Kg.';
            return false;
        }
        if (this.vehiculo.tipo === 'CARRO' && this.vehiculo.pesoMaximo > 2500) {
            this.errorMessage = 'El peso máximo para un automóvil/pickup no debería exceder los 2,500 Kg.';
            return false;
        }

        return true;
    }

    hideDialog() {
        this.visible.set(false);
        this.submitted = false;
        this.errorMessage = '';
    }

    save() {
        this.submitted = true;

        if (this.validarFormulario()) {
            this.onSave.emit(this.vehiculo);
            this.visible.set(false);
        }
    }
}

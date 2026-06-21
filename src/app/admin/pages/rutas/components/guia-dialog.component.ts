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
import { TextareaModule } from 'primeng/textarea';
import { DividerModule } from 'primeng/divider';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectButtonModule } from 'primeng/selectbutton';
import { CheckboxModule } from 'primeng/checkbox';

import { GuiaDespacho, ESTADOS_GUIA, MUNICIPIOS_NUEVA_ESPARTA } from '../data/rutas-mock';
import { CHOFERES_MOCK } from '../../choferes/data/choferes-mock';
import { VEHICULOS_MOCK } from '../../vehiculos/data/vehiculos-mock';


@Component({
    selector: 'app-guia-dialog',
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
        DividerModule,
        DatePickerModule,
        SelectButtonModule,
        CheckboxModule,
    ],
    templateUrl: './guia-dialog.component.html',
})
export class GuiaDialogComponent {
    private fb = inject(FormBuilder);

    visible = model<boolean>(false);
    guiaData = input<GuiaDespacho>({} as GuiaDespacho);
    onSave = output<GuiaDespacho>();

    submitted = false;
    errorMessage = '';

    estados = ESTADOS_GUIA;
    municipios = MUNICIPIOS_NUEVA_ESPARTA;

    fuentes = [
        { label: 'Manual', value: 'MANUAL' },
        { label: 'PDF', value: 'PDF' },
    ];

    clientes: { label: string; value: string; rif: string; nombreCliente: string }[] = [];

    choferes = CHOFERES_MOCK.map((ch) => ({
        label: `${ch.nombreCompleto} (${ch.documentoIdentidad?.prefijo}-${ch.documentoIdentidad?.numero})`,
        value: ch.id!,
        nombreChofer: ch.nombreCompleto!,
    }));

    vehiculos = VEHICULOS_MOCK.map((v) => ({
        label: `${v.placa} — ${v.marca} ${v.modelo} (${v.anio})`,
        value: v.id!,
        placaVehiculo: v.placa!,
    }));

    form: FormGroup = this.fb.group({
        numeroGuia: ['', Validators.required],
        idCliente: ['', Validators.required],
        idChofer: ['', Validators.required],
        idVehiculo: ['', Validators.required],
        municipio: ['', Validators.required],
        estado: ['EN_PROCESO', Validators.required],
        direccionEntrega: ['', Validators.required],
        pesoKg: [0, [Validators.required, Validators.min(0.1)]],
        precioCarga: [0, [Validators.required, Validators.min(0)]],
        pdfFuente: ['MANUAL'],
        observaciones: [''],
        fechaCarga: [null],
        fechaSalida: [null],
        fechaLlegadaCliente: [null],
        fechaRegreso: [null],
        tuvoDevolucion: [false],
    });

    constructor() {
        effect(() => {
            const data = this.guiaData();
            this.submitted = false;
            this.errorMessage = '';

            this.form.patchValue({
                numeroGuia: data.numeroGuia || '',
                idCliente: data.idCliente || '',
                idChofer: data.idChofer || '',
                idVehiculo: data.idVehiculo || '',
                municipio: data.municipio || '',
                estado: data.estado || 'EN_PROCESO',
                direccionEntrega: data.direccionEntrega || '',
                pesoKg: data.pesoKg || 0,
                precioCarga: data.precioCarga || 0,
                pdfFuente: data.pdfFuente || 'MANUAL',
                observaciones: data.observaciones || '',
                fechaCarga: data.fechaCarga ? new Date(data.fechaCarga) : null,
                fechaSalida: data.fechaSalida ? new Date(data.fechaSalida) : null,
                fechaLlegadaCliente: data.fechaLlegadaCliente
                    ? new Date(data.fechaLlegadaCliente)
                    : null,
                fechaRegreso: data.fechaRegreso ? new Date(data.fechaRegreso) : null,
                tuvoDevolucion: data.tuvoDevolucion || false,
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

    private formatDateTime(d: Date): string {
        const date = this.formatDate(d);
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${date} ${hours}:${minutes}`;
    }

    save() {
        this.submitted = true;
        this.errorMessage = '';

        if (this.form.invalid) {
            this.errorMessage = 'Complete todos los campos obligatorios marcados con *.';
            return;
        }

        const raw = this.form.getRawValue();

        const cliente = this.clientes.find((c) => c.value === raw.idCliente);
        const chofer = this.choferes.find((ch) => ch.value === raw.idChofer);
        const vehiculo = this.vehiculos.find((v) => v.value === raw.idVehiculo);

        const fechaCreacion = this.guiaData().fechaCreacion || this.formatDate(new Date());

        const eventos: any[] = [
            ...(raw.fechaSalida
                ? [
                      {
                          tipo: 'SALIDA' as const,
                          fecha: this.formatDateTime(raw.fechaSalida),
                          descripcion: 'Salida desde base',
                      },
                  ]
                : []),
            ...(raw.fechaLlegadaCliente
                ? [
                      {
                          tipo: 'LLEGADA_CLIENTE' as const,
                          fecha: this.formatDateTime(raw.fechaLlegadaCliente),
                          descripcion: 'Llegada a cliente',
                      },
                  ]
                : []),
            ...(raw.tuvoDevolucion
                ? [
                      {
                          tipo: 'DEVOLUCION' as const,
                          fecha: raw.fechaRegreso
                              ? this.formatDateTime(raw.fechaRegreso)
                              : this.formatDate(new Date()),
                          descripcion: 'Devolución registrada',
                      },
                  ]
                : []),
            ...(raw.fechaRegreso
                ? [
                      {
                          tipo: 'REGRESO_BASE' as const,
                          fecha: this.formatDateTime(raw.fechaRegreso),
                          descripcion: 'Regreso a base',
                      },
                  ]
                : []),
        ];

        const guiaFinal: GuiaDespacho = {
            ...this.guiaData(),
            numeroGuia: raw.numeroGuia,
            idCliente: raw.idCliente,
            nombreCliente: cliente?.nombreCliente || '',
            rifCliente: cliente?.rif || '',
            idChofer: raw.idChofer,
            nombreChofer: chofer?.nombreChofer || '',
            idVehiculo: raw.idVehiculo,
            placaVehiculo: vehiculo?.placaVehiculo || '',
            fechaCreacion,
            fechaCarga: raw.fechaCarga ? this.formatDate(raw.fechaCarga) : undefined,
            fechaSalida: raw.fechaSalida ? this.formatDateTime(raw.fechaSalida) : undefined,
            fechaLlegadaCliente: raw.fechaLlegadaCliente
                ? this.formatDateTime(raw.fechaLlegadaCliente)
                : undefined,
            fechaRegreso: raw.fechaRegreso ? this.formatDateTime(raw.fechaRegreso) : undefined,
            municipio: raw.municipio,
            direccionEntrega: raw.direccionEntrega,
            precioCarga: raw.precioCarga,
            pesoKg: raw.pesoKg,
            estado: raw.estado,
            tuvoDevolucion: raw.tuvoDevolucion,
            observaciones: raw.observaciones || undefined,
            pdfFuente: raw.pdfFuente,
            eventos: this.guiaData().id ? this.guiaData().eventos || [] : eventos,
        };

        this.onSave.emit(guiaFinal);
        this.visible.set(false);
    }
}

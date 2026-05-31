import { Component, input, output, model, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { FluidModule } from 'primeng/fluid';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { InputMaskModule } from 'primeng/inputmask';
import { DividerModule } from 'primeng/divider';

import {
    Cliente, PRIORIDADES_MOCK,
    PREFIJOS_DOCUMENTO, MUNICIPIOS_NUEVA_ESPARTA,
    DocumentoIdentidad, UbicacionResumen
} from '../data/clientes-mock';

@Component({
    selector: 'app-cliente-dialog',
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
        TextareaModule,
        InputMaskModule,
        DividerModule,
    ],
    templateUrl: './cliente-dialog.component.html'
})
export class ClienteDialogComponent {
    private fb = inject(FormBuilder);

    visible = model<boolean>(false);
    clienteData = input<Cliente>({});
    onSave = output<Cliente>();

    submitted = false;
    errorMessage = '';

    prioridades = PRIORIDADES_MOCK;
    prefijosDoc = PREFIJOS_DOCUMENTO;
    municipios = MUNICIPIOS_NUEVA_ESPARTA;

    form: FormGroup = this.fb.group({
        documentoIdentidad: this.fb.group({
            prefijo: ['V', Validators.required],
            numero: ['', [Validators.required, Validators.pattern(/^\d+$/), Validators.minLength(5), Validators.maxLength(12)]]
        }),
        nombreComercial: ['', Validators.required],
        telefono: ['', [Validators.pattern(/^(\+?\d{1,3}[-.\s]?)?\d{7,12}$/)]],
        idPrioridad: ['MEDIA', Validators.required],
        ubicaciones: this.fb.array([])
    });

    constructor() {
        effect(() => {
            const data = this.clienteData();
            this.submitted = false;
            this.errorMessage = '';

            this.form.patchValue({
                documentoIdentidad: data.documentoIdentidad || { prefijo: 'V', numero: '' },
                nombreComercial: data.nombreComercial || '',
                telefono: data.telefono || '',
                idPrioridad: data.idPrioridad || 'MEDIA',
            });

            this.ubicacionesForm.clear();
            const ubs: UbicacionResumen[] = data.ubicaciones?.length
                ? data.ubicaciones
                : [{ municipio: '', direccion: '', referencia: '', pais: 'Venezuela', estado: 'Nueva Esparta' }];

            for (const ub of ubs) {
                this.ubicacionesForm.push(this.crearUbicacionGroup(ub));
            }
        });
    }

    get ubicacionesForm(): FormArray {
        return this.form.get('ubicaciones') as FormArray;
    }

    private crearUbicacionGroup(ub: UbicacionResumen = {}): FormGroup {
        return this.fb.group({
            municipio: [ub.municipio || '', Validators.required],
            direccion: [ub.direccion || '', Validators.required],
            referencia: [ub.referencia || ''],
            pais: [{ value: ub.pais || 'Venezuela', disabled: true }],
            estado: [{ value: ub.estado || 'Nueva Esparta', disabled: true }],
        });
    }

    agregarUbicacion() {
        this.ubicacionesForm.push(this.crearUbicacionGroup());
    }

    eliminarUbicacion(index: number) {
        this.ubicacionesForm.removeAt(index);
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
            this.errorMessage = 'Complete todos los campos obligatorios marcados con *.';
            return;
        }

        const raw = this.form.getRawValue();
        const prioridadLabel = this.prioridades.find(p => p.value === raw.idPrioridad)?.label || '';

        const clienteFinal: Cliente = {
            ...this.clienteData(),
            documentoIdentidad: raw.documentoIdentidad as DocumentoIdentidad,
            nombreComercial: raw.nombreComercial,
            telefono: raw.telefono,
            idPrioridad: raw.idPrioridad,
            prioridad: prioridadLabel,
            ubicaciones: raw.ubicaciones
                .filter((u: UbicacionResumen) => u.direccion?.trim())
                .map((u: UbicacionResumen) => ({
                    ...u,
                    pais: 'Venezuela',
                    estado: 'Nueva Esparta',
                })),
        };

        this.onSave.emit(clienteFinal);
        this.visible.set(false);
    }
}

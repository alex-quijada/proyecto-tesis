import { Component, input, output, model, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';

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
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';

import { AuthService } from '../../../../auth/service/auth.service';
import { supabase } from '../../../../core/supabase.client';
import { MessageService } from 'primeng/api';

import {
    Usuario, ROLES, PREFIJOS_DOCUMENTO,
    GRADOS_LICENCIA, PRIORIDADES, MUNICIPIOS_NUEVA_ESPARTA,
    UbicacionResumen,
} from '../data/usuarios-mock';

const ROL_MAP_TO_DB: Record<string, string> = {
    ADMIN: 'Administrador',
    ANALISTA: 'Analista',
    CHOFER: 'Chofer',
    AYUDANTE: 'Ayudante',
};

const ROL_MAP_TO_DIALOG: Record<string, string> = {
    Administrador: 'ADMIN',
    Coordinador: 'ADMIN',
    Analista: 'ANALISTA',
    Chofer: 'CHOFER',
    Ayudante: 'AYUDANTE',
};

@Component({
    selector: 'app-usuario-dialog',
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
        TooltipModule,
        ToastModule,
    ],
    providers: [MessageService],
    templateUrl: './usuario-dialog.component.html',
})
export class UsuarioDialogComponent {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private messageService = inject(MessageService);

    visible = model<boolean>(false);
    usuarioData = input<Usuario>({} as Usuario);
    onSave = output<Usuario>();

    submitted = false;
    errorMessage = '';
    loading = signal(false);

    roles = ROLES;
    prefijosDoc = PREFIJOS_DOCUMENTO;
    gradosLicencia = GRADOS_LICENCIA;
    prioridades = PRIORIDADES;
    municipios = MUNICIPIOS_NUEVA_ESPARTA;

    activoOptions = [
        { label: 'Activo', value: true },
        { label: 'Inactivo', value: false },
    ];

    form: FormGroup = this.fb.group({
        username: ['', [Validators.required, Validators.minLength(4)]],
        email: ['', [Validators.required, Validators.email]],
        password: [''],
        prefijoDoc: ['V', Validators.required],
        numeroDoc: [null, [Validators.required, Validators.min(10000), Validators.max(999999999999)]],
        nombreCompleto: ['', Validators.required],
        telefono: [''],
        rol: ['', Validators.required],
        activo: [true],
        fechaIngreso: [null],
        licenciaNumero: [''],
        licenciaGrado: [''],
        licenciaVencimiento: [null],
        certMedicoNumero: [''],
        certMedicoExpedicion: [null],
        certMedicoVencimiento: [null],
        nombreComercial: [''],
        idPrioridad: ['MEDIA'],
        ubicaciones: this.fb.array([]),
    });

    get ubicacionesForm(): FormArray {
        return this.form.get('ubicaciones') as FormArray;
    }

    get rolValue(): string {
        return this.form.get('rol')?.value || '';
    }

    get isEditing(): boolean {
        return !!this.usuarioData().id;
    }

    private crearUbicacionGroup(ub: UbicacionResumen = {}): FormGroup {
        return this.fb.group({
            municipio: [ub.municipio || '', Validators.required],
            direccion: [ub.direccion || '', Validators.required],
            pais: [{ value: ub.pais || 'Venezuela', disabled: true }],
            estado: [{ value: ub.estado || 'Nueva Esparta', disabled: true }],
            referencia: [ub.referencia || ''],
        });
    }

    agregarUbicacion() {
        this.ubicacionesForm.push(this.crearUbicacionGroup());
    }

    eliminarUbicacion(index: number) {
        this.ubicacionesForm.removeAt(index);
    }

    constructor() {
        effect(() => {
            const data = this.usuarioData();
            this.submitted = false;
            this.errorMessage = '';

            this.form.patchValue({
                username: data.username || '',
                email: data.email || '',
                password: '',
                prefijoDoc: data.documentoIdentidad?.prefijo || 'V',
                numeroDoc: data.documentoIdentidad?.numero ? Number(data.documentoIdentidad.numero) : null,
                nombreCompleto: data.nombreCompleto || '',
                telefono: data.telefono || '',
                rol: data.rol || '',
                activo: data.activo ?? true,
                fechaIngreso: data.fechaIngreso ? new Date(data.fechaIngreso) : null,
                licenciaNumero: data.licencia?.numero || '',
                licenciaGrado: data.licencia?.grado || '',
                licenciaVencimiento: data.licencia?.fechaVencimiento ? new Date(data.licencia.fechaVencimiento) : null,
                certMedicoNumero: data.certificadoMedico?.numero || '',
                certMedicoExpedicion: data.certificadoMedico?.fechaExpedicion ? new Date(data.certificadoMedico.fechaExpedicion) : null,
                certMedicoVencimiento: data.certificadoMedico?.fechaVencimiento ? new Date(data.certificadoMedico.fechaVencimiento) : null,
                nombreComercial: data.nombreComercial || '',
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

    private addChoferValidation() {
        const licNum = this.form.get('licenciaNumero');
        const licGrado = this.form.get('licenciaGrado');
        const licVenc = this.form.get('licenciaVencimiento');
        const certNum = this.form.get('certMedicoNumero');
        const certExp = this.form.get('certMedicoExpedicion');
        const certVenc = this.form.get('certMedicoVencimiento');

        if (this.rolValue === 'CHOFER' || this.rolValue === 'AYUDANTE') {
            licNum?.setValidators([Validators.required]);
            licGrado?.setValidators([Validators.required]);
            licVenc?.setValidators([Validators.required]);
            certNum?.setValidators([Validators.required]);
            certExp?.setValidators([Validators.required]);
            certVenc?.setValidators([Validators.required]);
        } else {
            licNum?.clearValidators();
            licGrado?.clearValidators();
            licVenc?.clearValidators();
            certNum?.clearValidators();
            certExp?.clearValidators();
            certVenc?.clearValidators();
        }
        licNum?.updateValueAndValidity();
        licGrado?.updateValueAndValidity();
        licVenc?.updateValueAndValidity();
        certNum?.updateValueAndValidity();
        certExp?.updateValueAndValidity();
        certVenc?.updateValueAndValidity();
    }

    private addClienteValidation() {
        const nombreComercial = this.form.get('nombreComercial');
        if (this.rolValue === 'CLIENTE') {
            nombreComercial?.setValidators([Validators.required]);
        } else {
            nombreComercial?.clearValidators();
        }
        nombreComercial?.updateValueAndValidity();
    }

    onRolChange() {
        this.addChoferValidation();
        this.addClienteValidation();
    }

    private buildUsuarioFromForm(): Usuario {
        const raw = this.form.getRawValue();
        const prioridadLabel = this.prioridades.find(p => p.value === raw.idPrioridad)?.label || '';

        return {
            ...this.usuarioData(),
            username: raw.username,
            email: raw.email,
            documentoIdentidad: {
                prefijo: raw.prefijoDoc,
                numero: String(raw.numeroDoc),
            },
            nombreCompleto: raw.nombreCompleto,
            telefono: raw.telefono || '',
            rol: raw.rol,
            activo: raw.activo,
            fechaCreacion: this.usuarioData().fechaCreacion || this.formatDate(new Date()),
            fechaIngreso: raw.fechaIngreso ? this.formatDate(raw.fechaIngreso) : undefined,
            licencia: (raw.rol === 'CHOFER' || raw.rol === 'AYUDANTE')
                ? {
                    numero: raw.licenciaNumero,
                    grado: raw.licenciaGrado,
                    fechaVencimiento: raw.licenciaVencimiento ? this.formatDate(raw.licenciaVencimiento) : '',
                }
                : undefined,
            certificadoMedico: (raw.rol === 'CHOFER' || raw.rol === 'AYUDANTE')
                ? {
                    numero: raw.certMedicoNumero,
                    fechaExpedicion: raw.certMedicoExpedicion ? this.formatDate(raw.certMedicoExpedicion) : '',
                    fechaVencimiento: raw.certMedicoVencimiento ? this.formatDate(raw.certMedicoVencimiento) : '',
                }
                : undefined,
            nombreComercial: raw.rol === 'CLIENTE' ? raw.nombreComercial : undefined,
            idPrioridad: raw.rol === 'CLIENTE' ? raw.idPrioridad : undefined,
            prioridad: raw.rol === 'CLIENTE' ? prioridadLabel : undefined,
            ubicaciones: raw.rol === 'CLIENTE'
                ? raw.ubicaciones
                    .filter((u: UbicacionResumen) => u.direccion?.trim())
                    .map((u: UbicacionResumen) => ({
                        ...u,
                        pais: 'Venezuela',
                        estado: 'Nueva Esparta',
                    }))
                : undefined,
        };
    }

    async save() {
        this.submitted = true;
        this.errorMessage = '';
        this.loading.set(true);
        this.addChoferValidation();
        this.addClienteValidation();

        if (this.form.invalid) {
            this.errorMessage = 'Complete todos los campos obligatorios marcados con *.';
            this.loading.set(false);
            return;
        }

        try {
            const raw = this.form.getRawValue();

            if (this.isEditing) {
                await this.updateExistingUser(raw);
            } else {
                await this.createNewUser(raw);
            }
        } catch (error: any) {
            this.errorMessage = error.message || 'Error al procesar la solicitud. Intente de nuevo.';
            this.loading.set(false);
        }
    }

    private async createNewUser(raw: any) {
        if (raw.rol === 'CLIENTE') {
            await this.createCliente(raw);
        } else {
            if (!raw.password) {
                this.errorMessage = 'La contraseña es obligatoria para nuevos usuarios.';
                this.loading.set(false);
                return;
            }

            const dbRole = ROL_MAP_TO_DB[raw.rol];
            if (!dbRole) {
                this.errorMessage = `Rol "${raw.rol}" no válido para registro en Supabase.`;
                this.loading.set(false);
                return;
            }

            const cedula = Number(raw.numeroDoc);

            await this.authService.register(
                raw.email,
                raw.password,
                raw.nombreCompleto,
                cedula,
                dbRole as any,
            );

            this.messageService.add({
                severity: 'success',
                summary: 'Usuario registrado',
                detail: `${raw.nombreCompleto} creado exitosamente en Supabase Auth.`,
            });
        }

        const usuarioFinal = this.buildUsuarioFromForm();
        this.onSave.emit(usuarioFinal);
        this.visible.set(false);
        this.loading.set(false);
    }

    private async updateExistingUser(raw: any) {
        const id = this.usuarioData().id!;

        if (raw.rol === 'CLIENTE') {
            await this.updateCliente(raw, id);
        } else {
            await this.updateUsuarioInDb(raw);
        }

        const usuarioFinal = this.buildUsuarioFromForm();
        this.onSave.emit(usuarioFinal);
        this.visible.set(false);
        this.loading.set(false);
    }

    private async getRolId(nombreRol: string): Promise<string> {
        const { data, error } = await supabase
            .from('roles')
            .select('id_rol')
            .eq('nombre_rol', nombreRol)
            .single();

        if (error || !data) throw new Error(`Rol "${nombreRol}" no encontrado.`);
        return data.id_rol;
    }

    private async createCliente(raw: any) {
        const { data: prioridadData, error: prioridadError } = await supabase
            .from('prioridades_clientes')
            .select('id_prioridad')
            .eq('nombre_prioridad', raw.idPrioridad === 'ALTA' ? 'VIP' : raw.idPrioridad === 'MEDIA' ? 'Cadena' : 'Regular')
            .single();

        if (prioridadError || !prioridadData) throw new Error('Prioridad no encontrada.');

        const { data: cliente, error: clienteError } = await supabase
            .from('clientes')
            .insert({
                nombre_comercial: raw.nombreComercial || raw.nombreCompleto,
                id_prioridad: prioridadData.id_prioridad,
            })
            .select('id_cliente')
            .single();

        if (clienteError) throw new Error(`Error al crear cliente: ${clienteError.message}`);
        if (!cliente) throw new Error('No se pudo crear el cliente.');

        const ubicacionesValidas = raw.ubicaciones
            .filter((u: any) => u.direccion?.trim() && u.municipio);

        for (const ub of ubicacionesValidas) {
            const { error: ubError } = await supabase.from('ubicaciones').insert({
                id_cliente: cliente.id_cliente,
                direccion_completa: ub.direccion,
                municipio: ub.municipio,
                ciudad: ub.municipio,
                estado_provincia: 'Nueva Esparta',
                latitud: 0,
                longitud: 0,
                referencia: ub.referencia || null,
            });

            if (ubError) throw new Error(`Error al guardar ubicación: ${ubError.message}`);
        }

        this.messageService.add({
            severity: 'success',
            summary: 'Cliente registrado',
            detail: `${raw.nombreCompleto} creado exitosamente.`,
        });
    }

    private async updateCliente(raw: any, id: string) {
        const { error: updateError } = await supabase
            .from('clientes')
            .update({ nombre_comercial: raw.nombreComercial || raw.nombreCompleto })
            .eq('id_cliente', id);

        if (updateError) throw new Error(`Error al actualizar cliente: ${updateError.message}`);

        this.messageService.add({
            severity: 'success',
            summary: 'Cliente actualizado',
            detail: `${raw.nombreCompleto} modificado exitosamente.`,
        });
    }

    private async updateUsuarioInDb(raw: any) {
        const dbRole = ROL_MAP_TO_DB[raw.rol];
        const idRol = await this.getRolId(dbRole);

        const { error } = await supabase
            .from('usuarios')
            .update({
                email: raw.email,
                id_rol: idRol,
                nombre_completo: raw.nombreCompleto,
                cedula: Number(raw.numeroDoc),
            })
            .eq('id_usuario', this.usuarioData().id);

        if (error) throw new Error(`Error al actualizar usuario: ${error.message}`);

        this.messageService.add({
            severity: 'success',
            summary: 'Usuario actualizado',
            detail: `${raw.nombreCompleto} modificado exitosamente.`,
        });
    }
}

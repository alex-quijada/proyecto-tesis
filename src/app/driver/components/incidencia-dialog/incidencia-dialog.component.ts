import { Component, EventEmitter, Output, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface IncidenciaGuia {
    cliente: string;
    numeroGuia?: string;
    numeroFactura?: string;
}

export interface IncidenciaDatos {
    tipo: string;
    descripcion: string;
    foto: string | null;
}

export const TIPOS_INCIDENCIA = [
    { label: 'Cliente fuera de tiempo', value: 'Cliente fuera de tiempo' },
    { label: 'Cliente cerrado', value: 'Cliente cerrado' },
    { label: 'Producto faltante', value: 'Producto faltante' },
    { label: 'Producto sobrante', value: 'Producto sobrante' },
    { label: 'Producto no solicitado', value: 'Producto no solicitado' },
    { label: 'Producto dañado', value: 'Producto dañado' },
];

@Component({
    selector: 'app-incidencia-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, DialogModule, TextareaModule, SelectModule],
    template: `
        <p-dialog
            [(visible)]="visible"
            [modal]="true"
            [style]="{ width: '95%', maxWidth: '440px' }"
            [draggable]="false"
            [resizable]="false"
            header="Reportar incidencia"
            (onHide)="cancelar()"
        >
            <div class="space-y-4">
                @if (guia) {
                    <div class="bg-surface-50 dark:bg-surface-800 rounded-lg p-3 text-sm">
                        <div class="text-surface-700 dark:text-surface-200 font-semibold">
                            {{ guia.cliente }}
                        </div>
                        <div class="text-xs text-surface-400 font-mono mt-0.5">
                            {{ guia.numeroGuia
                            }}{{ guia.numeroFactura ? ' · ' + guia.numeroFactura : '' }}
                        </div>
                    </div>
                }

                <!-- Tipo de incidencia -->
                <div>
                    <label class="block text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-1.5">
                        Tipo de incidencia *
                    </label>
                    <p-select
                        [options]="tipos"
                        [(ngModel)]="tipo"
                        optionLabel="label"
                        optionValue="value"
                        placeholder="Selecciona el tipo"
                        styleClass="w-full"
                    />
                </div>

                <!-- Descripción / observaciones -->
                <div>
                    <label class="block text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-1.5">
                        Descripción y observaciones
                    </label>
                    <textarea
                        pTextarea
                        rows="3"
                        placeholder="Describe la incidencia..."
                        [(ngModel)]="descripcion"
                        [style]="{ width: '100%', maxWidth: '100%' }"
                    ></textarea>
                </div>

                <!-- Adjuntar foto (cámara) -->
                <div>
                    <label class="block text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-1.5">
                        Foto
                    </label>
                    @if (!foto()) {
                        <button
                            type="button"
                            class="w-full border-2 border-dashed border-surface-300 dark:border-surface-600 rounded-xl p-6 flex flex-col items-center gap-2 text-surface-400 hover:border-primary cursor-pointer transition-colors"
                            (click)="tomarFoto()"
                        >
                            <i class="pi pi-camera text-2xl"></i>
                            <span class="text-sm">Tomar foto con la cámara</span>
                        </button>
                    } @else {
                        <div class="relative rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700">
                            <img [src]="foto()" class="w-full h-40 object-cover" alt="Foto incidencia" />
                            <button
                                type="button"
                                class="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer"
                                (click)="quitarFoto()"
                                pTooltip="Quitar foto"
                            >
                                <i class="pi pi-times text-sm"></i>
                            </button>
                        </div>
                    }
                </div>
            </div>
            <ng-template pTemplate="footer">
                <div class="flex gap-2 w-full">
                    <p-button
                        label="Cancelar"
                        severity="secondary"
                        (onClick)="cancelar()"
                        styleClass="flex-1"
                    />
                    <p-button
                        label="Confirmar"
                        severity="danger"
                        icon="pi pi-exclamation-triangle"
                        [disabled]="!tipo"
                        (onClick)="confirmar()"
                        styleClass="flex-1"
                    />
                </div>
            </ng-template>
        </p-dialog>
    `,
})
export class IncidenciaDialogComponent {
    @Input() guia: IncidenciaGuia | null = null;
    @Output() confirm = new EventEmitter<IncidenciaDatos>();
    @Output() cancel = new EventEmitter<void>();

    visible = false;
    tipos = TIPOS_INCIDENCIA;
    tipo = '';
    descripcion = '';
    foto = signal<string | null>(null);
    tomandoFoto = signal(false);

    open() {
        this.visible = true;
        this.tipo = '';
        this.descripcion = '';
        this.foto.set(null);
    }

    async tomarFoto() {
        if (this.tomandoFoto()) return;
        this.tomandoFoto.set(true);
        try {
            const image = await Camera.getPhoto({
                quality: 70,
                allowEditing: false,
                resultType: CameraResultType.DataUrl,
                source: Capacitor.isNativePlatform()
                    ? CameraSource.Camera
                    : CameraSource.Prompt,
            });
            this.foto.set(image.dataUrl ?? null);
        } catch (err) {
            // Usuario canceló o error de cámara.
            console.warn('Foto cancelada/error:', err);
        } finally {
            this.tomandoFoto.set(false);
        }
    }

    quitarFoto() {
        this.foto.set(null);
    }

    confirmar() {
        if (!this.tipo) return;
        this.visible = false;
        this.confirm.emit({
            tipo: this.tipo,
            descripcion: this.descripcion,
            foto: this.foto(),
        });
    }

    cancelar() {
        this.visible = false;
        this.cancel.emit();
    }
}

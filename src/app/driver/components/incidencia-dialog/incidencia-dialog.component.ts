import { Component, EventEmitter, Output, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { TooltipModule } from 'primeng/tooltip';

export interface IncidenciaGuia {
    cliente: string;
    numeroGuia?: string;
    numeroFactura?: string;
}

export interface IncidenciaItem {
    tipo: string;
    descripcion: string;
    foto: string | null;
}

export interface IncidenciaDatos {
    incidencias: IncidenciaItem[];
}

export const TIPOS_INCIDENCIA = [
    { label: 'Cliente cerrado', value: 'CERRADO' },
    { label: 'Producto faltante', value: 'FALTANTE' },
    { label: 'Producto sobrante', value: 'SOBRANTE' },
    { label: 'Producto no solicitado', value: 'NO_SOLICITADO' },
    { label: 'Producto dañado', value: 'DANADO' },
];

import { comprimirDataUrl } from '@/app/services/image-compressor.util';

@Component({
    selector: 'app-incidencia-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        DialogModule,
        TextareaModule,
        SelectModule,
        TooltipModule,
    ],
    template: `
        <p-dialog
            [(visible)]="visible"
            [modal]="true"
            [style]="{ width: '95%', maxWidth: '440px' }"
            [draggable]="false"
            [resizable]="false"
            header="Reportar incidencias"
            (onHide)="cancelar()"
        >
            <div class="space-y-3">
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

                <!-- Lista de incidencias (una por form) -->
                <div class="flex flex-col gap-3">
                    @for (item of items; track $index) {
                        <div
                            class="border border-surface-300 dark:border-surface-600 rounded-lg p-3 bg-surface-0 dark:bg-surface-900"
                        >
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-xs font-semibold text-primary">
                                    <i class="pi pi-exclamation-circle mr-1"></i>
                                    Incidencia #{{ $index + 1 }}
                                </span>
                                @if (items.length > 1) {
                                    <button
                                        type="button"
                                        class="w-7 h-7 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center cursor-pointer"
                                        (click)="quitarItem($index)"
                                        pTooltip="Quitar incidencia"
                                    >
                                        <i class="pi pi-times text-xs"></i>
                                    </button>
                                }
                            </div>

                            <!-- Tipo -->
                            <div>
                                <label
                                    class="block text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-1"
                                >
                                    Tipo de incidencia *
                                </label>
                                <p-select
                                    [options]="tipos"
                                    [(ngModel)]="item.tipo"
                                    optionLabel="label"
                                    optionValue="value"
                                    placeholder="Selecciona el tipo"
                                    styleClass="w-full"
                                />
                            </div>

                            <!-- Descripción -->
                            <div class="mt-2">
                                <label
                                    class="block text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-1"
                                >
                                    Descripción y observaciones
                                </label>
                                <textarea
                                    pTextarea
                                    rows="2"
                                    placeholder="Describe la incidencia..."
                                    [(ngModel)]="item.descripcion"
                                    [style]="{ width: '100%', maxWidth: '100%' }"
                                ></textarea>
                            </div>

                            <!-- Foto -->
                            <div class="mt-2">
                                <label
                                    class="block text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-1"
                                >
                                    Foto
                                </label>
                                @if (!item.foto) {
                                    <button
                                        type="button"
                                        class="w-full border-2 border-dashed border-surface-300 dark:border-surface-600 rounded-xl py-4 flex flex-col items-center gap-1.5 text-surface-400 hover:border-primary cursor-pointer transition-colors"
                                        (click)="tomarFoto($index)"
                                    >
                                        <i class="pi pi-camera text-xl"></i>
                                        <span class="text-xs">Tomar foto</span>
                                    </button>
                                } @else {
                                    <div
                                        class="relative rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700"
                                    >
                                        <img
                                            [src]="item.foto"
                                            class="w-full h-32 object-cover"
                                            alt="Foto incidencia"
                                        />
                                        <button
                                            type="button"
                                            class="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer"
                                            (click)="quitarFoto($index)"
                                            pTooltip="Quitar foto"
                                        >
                                            <i class="pi pi-times text-xs"></i>
                                        </button>
                                    </div>
                                }
                            </div>
                        </div>
                    }
                </div>

                <!-- Agregar otra incidencia -->
                <p-button
                    label="Agregar incidencia"
                    icon="pi pi-plus"
                    severity="info"
                    outlined
                    size="small"
                    styleClass="w-full"
                    (onClick)="agregarItem()"
                />
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
                        [disabled]="!tieneAlguna()"
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
    items: IncidenciaItem[] = [];
    tomandoFotoIndex = signal<number | null>(null);

    open() {
        this.visible = true;
        this.items = [this.nuevoItem()];
    }

    private nuevoItem(): IncidenciaItem {
        return { tipo: '', descripcion: '', foto: null };
    }

    agregarItem() {
        this.items.push(this.nuevoItem());
    }

    quitarItem(index: number) {
        this.items.splice(index, 1);
    }

    async tomarFoto(index: number) {
        if (this.tomandoFotoIndex() !== null) return;
        this.tomandoFotoIndex.set(index);
        try {
            const image = await Camera.getPhoto({
                quality: 70,
                width: 1280,
                height: 1280,
                correctOrientation: true,
                allowEditing: false,
                resultType: CameraResultType.DataUrl,
                source: Capacitor.isNativePlatform() ? CameraSource.Camera : CameraSource.Prompt,
            });
            if (image.dataUrl) {
                const comprimida = await comprimirDataUrl(image.dataUrl, 1280, 1280, 0.72);
                this.items[index].foto = comprimida;
            } else {
                this.items[index].foto = null;
            }
        } catch (err) {
            console.warn('Foto cancelada/error:', err);
        } finally {
            this.tomandoFotoIndex.set(null);
        }
    }

    quitarFoto(index: number) {
        this.items[index].foto = null;
    }

    confirmar() {
        const incidencias = this.items.filter((i) => i.tipo).map((i) => ({ ...i }));
        if (incidencias.length === 0) return;
        this.visible = false;
        this.confirm.emit({ incidencias });
    }

    tieneAlguna(): boolean {
        return this.items.some((i) => i.tipo);
    }

    cancelar() {
        this.visible = false;
        this.cancel.emit();
    }
}

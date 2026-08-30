import {
    Component,
    output,
    input,
    inject,
    OnDestroy,
    ElementRef,
    viewChild,
    afterNextRender,
    signal,
    effect,
    ChangeDetectionStrategy,
} from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { GoogleSearchService, SuggestionResult } from '../service/google-search.service';

export interface UbicacionSeleccionada {
    lat: number;
    lng: number;
    direccion: string;
}

@Component({
    selector: 'app-busqueda-ubicacion',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="relative">
            <input
                #inputEl
                type="text"
                placeholder="Buscar dirección…"
                class="w-full p-2 text-sm border border-surface-300 dark:border-surface-600 rounded bg-surface-0 dark:bg-surface-900 text-surface-900 dark:text-surface-0 placeholder:text-surface-400 outline-none focus:border-primary"
                (input)="onInput($any($event.target).value)"
                (blur)="onBlur()"
                (focus)="onFocus()"
            />

            @if (sugerencias().length && abierto()) {
                <ul
                    class="absolute z-50 left-0 right-0 mt-1 bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded shadow-lg max-h-48 overflow-y-auto text-sm"
                >
                    @for (sug of sugerencias(); track sug.placeId) {
                        <li
                            class="px-3 py-2 cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-800 dark:text-surface-100"
                            (mousedown)="seleccionar(sug)"
                        >
                            <span class="block font-medium">{{ sug.name }}</span>
                            <span class="block text-xs text-surface-500 truncate">{{
                                sug.fullAddress
                            }}</span>
                        </li>
                    }
                </ul>
            }

            @if (cargando()) {
                <i class="pi pi-spin pi-spinner absolute right-2 top-2.5 text-surface-400"></i>
            }
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusquedaUbicacionComponent implements OnDestroy {
    private searchService = inject(GoogleSearchService);

    readonly municipioNombre = input<string>('');
    readonly direccionInicial = input<string>('');
    readonly ubicacionSeleccionada = output<UbicacionSeleccionada>();

    private inputEl = viewChild.required<ElementRef<HTMLInputElement>>('inputEl');

    sugerencias = signal<SuggestionResult[]>([]);
    abierto = signal(false);
    cargando = signal(false);

    private searchParams$ = new Subject<{ query: string; municipio: string }>();
    private sub: (() => void) | null = null;
    private blurTimer: ReturnType<typeof setTimeout> | null = null;
    private currentQuery = '';

    constructor() {
        afterNextRender(() => this.setupRxPipeline());

        effect(() => {
            const municipio = this.municipioNombre();
            if (this.currentQuery.trim()) {
                this.searchParams$.next({ query: this.currentQuery, municipio });
            }
        });

        effect(() => {
            const dir = this.direccionInicial();
            if (dir && !this.currentQuery) {
                this.currentQuery = dir;
                const el = this.inputEl()?.nativeElement;
                if (el) el.value = dir;
                this.searchParams$.next({ query: dir, municipio: this.municipioNombre() });
            }
        });
    }

    private setupRxPipeline() {
        const subscription = this.searchParams$
            .pipe(
                debounceTime(400),
                distinctUntilChanged((a, b) => a.query === b.query && a.municipio === b.municipio),
                switchMap(async ({ query, municipio }) => {
                    if (!query.trim()) {
                        this.sugerencias.set([]);
                        this.abierto.set(false);
                        this.cargando.set(false);
                        return;
                    }
                    const partes = [query];
                    if (municipio) partes.push(municipio);
                    partes.push('Nueva Esparta');

                    this.cargando.set(true);
                    const resultados = await this.searchService.buscarSugerencias(
                        partes.join(', '),
                    );
                    this.cargando.set(false);
                    this.sugerencias.set(resultados);
                    this.abierto.set(resultados.length > 0);
                }),
            )
            .subscribe();
        this.sub = () => subscription.unsubscribe();

        const dir = this.direccionInicial();
        if (dir && !this.currentQuery) {
            this.currentQuery = dir;
            const el = this.inputEl()?.nativeElement;
            if (el) el.value = dir;
            this.searchParams$.next({ query: dir, municipio: this.municipioNombre() });
        }
    }

    onInput(value: string) {
        this.currentQuery = value;
        this.searchParams$.next({ query: value, municipio: this.municipioNombre() });
    }

    onFocus() {
        if (this.sugerencias().length) this.abierto.set(true);
    }

    onBlur() {
        this.blurTimer = setTimeout(() => this.abierto.set(false), 200);
    }

    async seleccionar(sug: SuggestionResult) {
        this.abierto.set(false);
        this.cargando.set(true);
        this.sugerencias.set([]);

        const detalle = await this.searchService.obtenerCoordenadas(sug.placeId);
        this.cargando.set(false);

        if (detalle) {
            this.currentQuery = detalle.direccion || sug.fullAddress;
            this.inputEl().nativeElement.value = this.currentQuery;

            this.ubicacionSeleccionada.emit({
                lat: detalle.lat,
                lng: detalle.lng,
                direccion: detalle.direccion,
            });
        }
    }

    ngOnDestroy() {
        this.sub?.();
        if (this.blurTimer) clearTimeout(this.blurTimer);
    }
}

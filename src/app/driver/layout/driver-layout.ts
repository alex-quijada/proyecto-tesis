import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterModule, RouterOutlet } from '@angular/router';
import { trigger, transition, style, animate, query } from '@angular/animations';

import { DriverStoreService } from '../services/driver-store.service';
import { NavigationService } from '../services/navigation.service';
import { PosicionService } from '../services/posicion.service';
import { TiemposService } from '../services/tiempos.service';
import { TrazaService } from '../services/traza.service';
import { DriverTopbar } from './driver-topbar';
import { DriverBottomNav } from './driver-bottom-nav';

@Component({
    selector: 'app-driver-layout',
    standalone: true,
    imports: [CommonModule, RouterModule, DriverTopbar, DriverBottomNav],
<<<<<<< HEAD
    providers: [DriverStoreService, NavigationService, PosicionService, TiemposService],
=======
    providers: [
        DriverStoreService,
        NavigationService,
        PosicionService,
        TiemposService,
        TrazaService,
    ],
>>>>>>> a475b8c11fb21d4988ba1ae1c94d3189f0b63af5
    animations: [
        trigger('routeAnimations', [
            // El mapa nativo se dibuja debajo del WebView con position: fixed;
            // animarlo desencuadra el surface → transiciones vacías hacia/desde 'mapa'.
            transition('mapa => *', []),
            transition('* => mapa', []),
            transition('* => *', [
                // Fade-in de la ventana entrante SOLO (sin position:absolute ni
                // animar :leave): el router reemplaza la saliente al instante, así
                // no se sobreponen ventanas ni colapsa el alto del contenedor.
                query(
                    ':enter',
                    [
                        style({ opacity: 0, transform: 'translateY(2%)' }),
                        animate('260ms ease-out', style({ opacity: 1, transform: 'none' })),
                    ],
                    { optional: true },
                ),
            ]),
        ]),
    ],
    template: `
        <div
            class="min-h-screen pb-20"
            [class.bg-surface-50]="!fondoMapa()"
            [class.dark:bg-surface-950]="!fondoMapa()"
        >
            @if (mostrarTopbar()) {
                <app-driver-topbar />
            }
            <div [@routeAnimations]="animacionRuta()">
                <router-outlet />
            </div>
            <app-driver-bottom-nav />
        </div>
    `,
})
export class DriverLayout implements OnInit {
    private router = inject(Router);
    private store = inject(DriverStoreService);

    private readonly posicionService = inject(PosicionService);

    mostrarTopbar = signal(true);
    // El mapa nativo (Android) se dibuja debajo del WebView: sin fondo opaco.
    fondoMapa = signal(false);
    animacionRuta = signal('pagina');

    ngOnInit() {
        this.store.cargarDatos();

        this.router.events.subscribe((event) => {
            if (event instanceof NavigationEnd) {
                const esPerfil = event.url.startsWith('/driver/perfil');
                this.mostrarTopbar.set(!esPerfil);
                this.fondoMapa.set(event.url.startsWith('/driver/mapa'));
                this.animacionRuta.set(this.obtenerAnimacionRuta());
            }
        });
    }

    private obtenerAnimacionRuta(): string {
        let route = this.router.routerState.root;
        while (route.firstChild) {
            route = route.firstChild;
        }
        return (route.snapshot.data?.['animation'] as string) || 'pagina';
    }
}

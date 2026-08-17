import { Injectable, signal, inject } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface NavSdkPlugin {
    init(): Promise<{ ready: boolean }>;
    setDestinations(options: {
        destinations: { lat: number; lng: number }[];
    }): Promise<{ status: string }>;
    startGuidance(): Promise<void>;
    stopGuidance(): Promise<void>;
    continueToNextDestination(): Promise<void>;
    getRouteSegments(): Promise<{
        legs: { points: { lat: number; lng: number }[] }[];
    }>;
    moveVehicle(options: { lat: number; lng: number; bearing: number }): Promise<void>;
    anclarEn(options: { lat: number; lng: number }): Promise<void>;
    cleanup(): Promise<void>;
    addListener(eventName: string, listener: (data: any) => void): Promise<PluginListenerHandle>;
}

export interface RutaTramo {
    points: { lat: number; lng: number }[];
    distAcum: number[];
    total: number;
}

const NavigationSdk = registerPlugin<NavSdkPlugin>('NavigationSdk');

/**
 * Wrapper del plugin nativo NavigationSdk (Google Maps Navigation SDK).
 * Expone señales reactivas a partir de los eventos nativos (location,
 * remaining, arrival, offRoute, session).
 */
@Injectable({ providedIn: 'root' })
export class NavigationSdkService {
    readonly ready = signal(false);
    readonly location = signal<{ lat: number; lng: number } | null>(null);
    readonly remainingTime = signal(0);
    readonly remainingDistance = signal(0);
    readonly isFinalDestination = signal(false);
    readonly arrivals = signal(0);
    readonly offRoute = signal(false);

    private listeners: PluginListenerHandle[] = [];
    private iniciado = false;

    async init(): Promise<boolean> {
        if (this.iniciado) return this.ready();
        this.iniciado = true;
        try {
            await NavigationSdk.init();
            this.ready.set(true);

            this.listeners.push(
                await NavigationSdk.addListener('location', (data: any) => {
                    this.location.set({ lat: data.lat, lng: data.lng });
                }),
                await NavigationSdk.addListener('remaining', (data: any) => {
                    this.remainingTime.set(data.remainingTime ?? 0);
                    this.remainingDistance.set(data.remainingDistance ?? 0);
                }),
                await NavigationSdk.addListener('arrival', (data: any) => {
                    this.isFinalDestination.set(data.isFinalDestination === true);
                    this.arrivals.update((n) => n + 1);
                }),
                await NavigationSdk.addListener('offRoute', () => this.offRoute.set(true)),
                await NavigationSdk.addListener('session', () => undefined),
            );
            return true;
        } catch (err) {
            console.error('[NavigationSdk] init error', err);
            this.iniciado = false;
            return false;
        }
    }

    async setDestinations(destinations: { lat: number; lng: number }[]): Promise<boolean> {
        try {
            const res = await NavigationSdk.setDestinations({ destinations });
            return res.status === 'OK';
        } catch (err) {
            console.error('[NavigationSdk] setDestinations error', err);
            return false;
        }
    }

    async startGuidance(): Promise<void> {
        await NavigationSdk.startGuidance();
    }

    async stopGuidance(): Promise<void> {
        await NavigationSdk.stopGuidance();
    }

    async continueToNextDestination(): Promise<void> {
        await NavigationSdk.continueToNextDestination();
        this.isFinalDestination.set(false);
    }

    async getRouteSegments(): Promise<{ legs: { points: { lat: number; lng: number }[] }[] }> {
        return await NavigationSdk.getRouteSegments();
    }

    async moveVehicle(lat: number, lng: number, bearing: number): Promise<void> {
        await NavigationSdk.moveVehicle({ lat, lng, bearing });
    }

    async anclarEn(lat: number, lng: number): Promise<void> {
        await NavigationSdk.anclarEn({ lat, lng });
    }

    async cleanup(): Promise<void> {
        this.iniciado = false;
        for (const l of this.listeners) {
            await l.remove().catch(() => undefined);
        }
        this.listeners = [];
        await NavigationSdk.cleanup().catch(() => undefined);
        this.ready.set(false);
        this.location.set(null);
        this.isFinalDestination.set(false);
        this.offRoute.set(false);
    }
}

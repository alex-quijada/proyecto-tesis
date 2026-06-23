import { Injectable } from '@angular/core';

export interface SuggestionResult {
    placeId: string;
    name: string;
    fullAddress: string;
}

@Injectable({ providedIn: 'root' })
export class GoogleSearchService {
    private autocompleteService: google.maps.places.AutocompleteService | null = null;
    private placesService: google.maps.places.PlacesService | null = null;
    private sessionToken: google.maps.places.AutocompleteSessionToken | null = null;
    private margaritaBounds: google.maps.LatLngBounds | null = null;
    private ready = false;

    constructor() {
        this.init();
    }

    private async init() {
        await this.waitForGoogle();
        this.autocompleteService = new google.maps.places.AutocompleteService();
        this.sessionToken = new google.maps.places.AutocompleteSessionToken();
        this.margaritaBounds = new google.maps.LatLngBounds(
            { lat: 10.88, lng: -64.32 },
            { lat: 11.20, lng: -63.74 },
        );
        this.ready = true;
    }

    private waitForGoogle(): Promise<void> {
        if (typeof google !== 'undefined') return Promise.resolve();
        return new Promise((resolve) => {
            const check = () => {
                if (typeof google !== 'undefined') return resolve();
                setTimeout(check, 100);
            };
            check();
        });
    }

    buscarSugerencias(query: string): Promise<SuggestionResult[]> {
        if (!query.trim() || !this.autocompleteService) return Promise.resolve([]);

        return new Promise((resolve) => {
            this.autocompleteService!.getPlacePredictions(
                {
                    input: query,
                    locationRestriction: this.margaritaBounds!,
                    componentRestrictions: { country: 've' },
                    language: 'es',
                    sessionToken: this.sessionToken!,
                },
                (predictions, status) => {
                    if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
                        return resolve([]);
                    }

                    resolve(
                        predictions.slice(0, 5).map((p) => ({
                            placeId: p.place_id,
                            name: p.structured_formatting?.main_text || '',
                            fullAddress: p.description || '',
                        })),
                    );
                },
            );
        });
    }

    obtenerCoordenadas(
        placeId: string,
    ): Promise<{ lat: number; lng: number; direccion: string } | null> {
        if (!this.placesService) {
            const dummy = document.createElement('div');
            this.placesService = new google.maps.places.PlacesService(dummy);
        }

        return new Promise((resolve) => {
            this.placesService!.getDetails(
                {
                    placeId,
                    fields: ['geometry', 'formatted_address'],
                    sessionToken: this.sessionToken!,
                },
                (place, status) => {
                    this.sessionToken = new google.maps.places.AutocompleteSessionToken();

                    if (
                        status !== google.maps.places.PlacesServiceStatus.OK ||
                        !place?.geometry?.location
                    ) {
                        return resolve(null);
                    }

                    resolve({
                        lat: place.geometry.location.lat(),
                        lng: place.geometry.location.lng(),
                        direccion: place.formatted_address || '',
                    });
                },
            );
        });
    }
}

import { Injectable, effect, signal, computed } from '@angular/core';

export interface LayoutConfig {
    preset: string;
    primary: string;
    surface: string | undefined | null;
    darkTheme: boolean;
    menuMode: string;
}

const DEFAULT_CONFIG: LayoutConfig = {
    preset: 'Aura',
    primary: 'emerald',
    surface: null,
    darkTheme: false,
    menuMode: 'static',
};

const STORAGE_KEY = 'brandia_layout_config';

function loadInitialConfig(): LayoutConfig {
    if (typeof window === 'undefined' || !window.localStorage) {
        return DEFAULT_CONFIG;
    }
    try {
        const saved =
            localStorage.getItem(STORAGE_KEY) || localStorage.getItem('sakai_layout_config');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.primary === 'noir') {
                parsed.primary = DEFAULT_CONFIG.primary;
            }
            return {
                ...DEFAULT_CONFIG,
                ...parsed,
            };
        }
    } catch {
        /* noop */
    }
    return DEFAULT_CONFIG;
}

interface LayoutState {
    staticMenuDesktopInactive: boolean;
    overlayMenuActive: boolean;
    configSidebarVisible: boolean;
    mobileMenuActive: boolean;
    menuHoverActive: boolean;
    activePath: string | null;
}

@Injectable({
    providedIn: 'root',
})
export class LayoutService {
    private readonly initialConfig = loadInitialConfig();

    layoutConfig = signal<LayoutConfig>(this.initialConfig);

    layoutState = signal<LayoutState>({
        staticMenuDesktopInactive: false,
        overlayMenuActive: false,
        configSidebarVisible: false,
        mobileMenuActive: false,
        menuHoverActive: false,
        activePath: null,
    });

    theme = computed(() => (this.layoutConfig().darkTheme ? 'light' : 'dark'));

    isSidebarActive = computed(
        () => this.layoutState().overlayMenuActive || this.layoutState().mobileMenuActive,
    );

    isDarkTheme = computed(() => this.layoutConfig().darkTheme);

    getPrimary = computed(() => this.layoutConfig().primary);

    getSurface = computed(() => this.layoutConfig().surface);

    isOverlay = computed(() => this.layoutConfig().menuMode === 'overlay');

    transitionComplete = signal<boolean>(false);

    private initialized = false;

    constructor() {
        if (typeof document !== 'undefined') {
            this.toggleDarkMode(this.initialConfig);
        }

        effect(() => {
            const config = this.layoutConfig();

            // Persistir configuración en localStorage
            if (typeof window !== 'undefined' && window.localStorage) {
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
                } catch {
                    /* noop */
                }
            }

            if (!this.initialized || !config) {
                this.initialized = true;
                return;
            }

            this.handleDarkModeTransition(config);
        });
    }

    private handleDarkModeTransition(config: LayoutConfig): void {
        const supportsViewTransition = 'startViewTransition' in document;

        if (supportsViewTransition) {
            this.startViewTransition(config);
        } else {
            this.toggleDarkMode(config);
        }
    }

    private startViewTransition(config: LayoutConfig): void {
        try {
            const transition = document.startViewTransition(() => {
                this.toggleDarkMode(config);
            });
            transition.finished.catch(() => {});
        } catch {
            this.toggleDarkMode(config);
        }
    }

    toggleDarkMode(config?: LayoutConfig): void {
        const _config = config || this.layoutConfig();
        if (_config.darkTheme) {
            document.documentElement.classList.add('app-dark');
        } else {
            document.documentElement.classList.remove('app-dark');
        }
    }

    onMenuToggle() {
        if (this.isOverlay()) {
            this.layoutState.update((prev) => ({
                ...prev,
                overlayMenuActive: !this.layoutState().overlayMenuActive,
            }));
        }

        if (this.isDesktop()) {
            this.layoutState.update((prev) => ({
                ...prev,
                staticMenuDesktopInactive: !this.layoutState().staticMenuDesktopInactive,
            }));
        } else {
            this.layoutState.update((prev) => ({
                ...prev,
                mobileMenuActive: !this.layoutState().mobileMenuActive,
            }));
        }
    }

    showConfigSidebar() {
        this.layoutState.update((prev) => ({ ...prev, configSidebarVisible: true }));
    }

    hideConfigSidebar() {
        this.layoutState.update((prev) => ({ ...prev, configSidebarVisible: false }));
    }

    isDesktop() {
        return window.innerWidth > 991;
    }

    isMobile() {
        return !this.isDesktop();
    }
}

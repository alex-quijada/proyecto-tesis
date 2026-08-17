package com.tesis.driver;

import android.graphics.Color;
import android.location.Location;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.FrameLayout;

import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.maps.CameraUpdateFactory;
import com.google.android.gms.maps.GoogleMap;
import com.google.android.gms.maps.model.BitmapDescriptorFactory;
import com.google.android.gms.maps.model.CameraPosition;
import com.google.android.gms.maps.model.LatLng;
import com.google.android.gms.maps.model.Marker;
import com.google.android.gms.maps.model.MarkerOptions;
import com.google.android.libraries.navigation.ArrivalEvent;
import com.google.android.libraries.navigation.ListenableResultFuture;
import com.google.android.libraries.navigation.NavigationApi;
import com.google.android.libraries.navigation.NavigationView;
import com.google.android.libraries.navigation.Navigator;
import com.google.android.libraries.navigation.RoadSnappedLocationProvider;
import com.google.android.libraries.navigation.RouteSegment;
import com.google.android.libraries.navigation.RoutingOptions;
import com.google.android.libraries.navigation.TermsAndConditionsCheckOption;
import com.google.android.libraries.navigation.TimeAndDistance;
import com.google.android.libraries.navigation.Waypoint;

import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/**
 * Capacitor plugin que envuelve el Google Maps Navigation SDK para Android.
 *
 * Hostea un NavigationView (mapa de navegación) DETRÁS del WebView transparente
 * y expone métodos/eventos a JS para que la página Angular renderice sus
 * propios overlays (maniobra, próximos pasos, sheet de entrega…). La UI nativa
 * del SDK se oculta (setNavigationUiEnabled(false)).
 */
@CapacitorPlugin(name = "NavigationSdk")
public class NavigationSdkPlugin extends Plugin {

    private Navigator navigator;
    private RoadSnappedLocationProvider locationProvider;
    private NavigationView navView;
    private FrameLayout navContainer;
    private GoogleMap navMap;
    private Marker vehicleMarker;
    private boolean viewAdded = false;

    private final RoadSnappedLocationProvider.LocationListener locationListener = location -> {
        JSObject data = new JSObject();
        data.put("lat", location.getLatitude());
        data.put("lng", location.getLongitude());
        data.put("speed", location.hasSpeed() ? location.getSpeed() : 0);
        notifyListeners("location", data);
    };

    private final Navigator.ArrivalListener arrivalListener =
            event -> {
                JSObject data = new JSObject();
                data.put("isFinalDestination", event != null && event.isFinalDestination());
                notifyListeners("arrival", data);
            };

    private final Navigator.RouteChangedListener routeChangedListener =
            () -> notifyListeners("routeChanged", new JSObject());

    private final Navigator.RemainingTimeOrDistanceChangedListener remainingListener =
            () -> {
                if (navigator == null) return;
                TimeAndDistance td = navigator.getCurrentTimeAndDistance();
                if (td == null) return;
                JSObject data = new JSObject();
                data.put("remainingTime", td.getSeconds());
                data.put("remainingDistance", td.getMeters());
                notifyListeners("remaining", data);
            };

    private final Navigator.ReroutingListener reroutingListener =
            () -> notifyListeners("offRoute", new JSObject());

    private final Navigator.NavigationSessionListener sessionListener =
            () -> notifyListeners("session", new JSObject());

    @PluginMethod
    public void init(PluginCall call) {
        final FragmentActivity activity = (FragmentActivity) getActivity();
        activity.runOnUiThread(() -> {
            addNavView();
            if (NavigationApi.areTermsAccepted(activity.getApplication())) {
                inicializarNavigator(call, activity);
            } else {
                NavigationApi.showTermsAndConditionsDialog(
                        activity,
                        "Google Navigation SDK",
                        "Para usar la navegación por voz debes aceptar los términos y condiciones de Google.",
                        new NavigationApi.OnTermsResponseListener() {
                            @Override
                            public void onTermsResponse(boolean accepted) {
                                if (accepted) {
                                    inicializarNavigator(call, activity);
                                } else {
                                    call.reject("Términos no aceptados");
                                }
                            }
                        });
            }
        });
    }

    private void inicializarNavigator(PluginCall call, FragmentActivity activity) {
        final Handler handler = new Handler(Looper.getMainLooper());
        final boolean[] resuelto = {false};
        // Timeout de seguridad: si ni onNavigatorReady ni onError llegan, no cuelga.
        handler.postDelayed(
                () -> {
                    if (!resuelto[0]) {
                        resuelto[0] = true;
                        call.reject(
                                "Tiempo de espera agotado al inicializar el Navigation SDK "
                                        + "(revisa key, red y ToS).");
                    }
                },
                40000);

        NavigationApi.getNavigator(
                activity,
                new NavigationApi.NavigatorListener() {
                    @Override
                    public void onNavigatorReady(Navigator nav) {
                        if (resuelto[0]) return;
                        resuelto[0] = true;
                        handler.removeCallbacksAndMessages(null);
                        navigator = nav;
                        navigator.addArrivalListener(arrivalListener);
                        navigator.addRouteChangedListener(routeChangedListener);
                        navigator.addRemainingTimeOrDistanceChangedListener(0, 0, remainingListener);
                        navigator.addReroutingListener(reroutingListener);
                        navigator.addNavigationSessionListener(sessionListener);

                        locationProvider =
                                NavigationApi.getRoadSnappedLocationProvider(activity.getApplication());
                        if (locationProvider != null) {
                            locationProvider.addLocationListener(locationListener);
                        }

                        JSObject res = new JSObject();
                        res.put("ready", true);
                        call.resolve(res);
                    }

                    @Override
                    public void onError(@NavigationApi.ErrorCode int errorCode) {
                        if (resuelto[0]) return;
                        resuelto[0] = true;
                        handler.removeCallbacksAndMessages(null);
                        call.reject(
                                "Error inicializando Navigation SDK: " + errorCode,
                                String.valueOf(errorCode));
                    }
                },
                TermsAndConditionsCheckOption.ENABLED);
    }

    @PluginMethod
    public void setDestinations(PluginCall call) {
        if (navigator == null) {
            call.reject("Navigator no inicializado");
            return;
        }
        try {
            JSArray destinations = call.getArray("destinations");
            List<Waypoint> waypoints = new ArrayList<>();
            for (int i = 0; i < destinations.length(); i++) {
                org.json.JSONObject obj = destinations.getJSONObject(i);
                double lat = obj.getDouble("lat");
                double lng = obj.getDouble("lng");
                waypoints.add(Waypoint.builder().setLatLng(lat, lng).build());
            }

            RoutingOptions options = new RoutingOptions();
            options.travelMode(RoutingOptions.TravelMode.DRIVING);

            getActivity().runOnUiThread(() -> {
                ListenableResultFuture<Navigator.RouteStatus> future =
                        navigator.setDestinations(waypoints, options);
                future.setOnResultListener(
                        status -> {
                            if (status == Navigator.RouteStatus.OK) {
                                JSObject res = new JSObject();
                                res.put("status", "OK");
                                call.resolve(res);
                            } else {
                                call.reject("Ruta no encontrada: " + status.name(), status.name());
                            }
                        });
            });
        } catch (Exception ex) {
            call.reject("Error al fijar destinos: " + ex.getMessage());
        }
    }

    @PluginMethod
    public void startGuidance(PluginCall call) {
        if (navigator == null) {
            call.reject("Navigator no inicializado");
            return;
        }
        getActivity().runOnUiThread(() -> {
            // Sin narración por voz.
            navigator.setAudioGuidance(Navigator.AudioGuidance.SILENT);
            navigator.startGuidance();
            // La cámara la controlamos nosotros (moveVehicle); no usamos la
            // cámara de seguimiento del SDK para que no pelee con la nuestra.
            call.resolve();
        });
    }

    @PluginMethod
    public void stopGuidance(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (navigator != null) {
                navigator.stopGuidance();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void continueToNextDestination(PluginCall call) {
        if (navigator == null) {
            call.reject("Navigator no inicializado");
            return;
        }
        getActivity().runOnUiThread(() -> {
            navigator.continueToNextDestination();
            call.resolve();
        });
    }

    /** Devuelve los polyline de todas las piernas de la ruta (para el interpolador JS). */
    @PluginMethod
    public void getRouteSegments(PluginCall call) {
        final FragmentActivity activity = (FragmentActivity) getActivity();
        activity.runOnUiThread(() -> {
            if (navigator == null) {
                call.reject("Navigator no inicializado");
                return;
            }
            JSObject res = new JSObject();
            JSArray legs = new JSArray();
            List<RouteSegment> segments = navigator.getRouteSegments();
            if (segments == null || segments.size() == 0) {
                List<LatLng> current = obtenerRutaActual();
                if (current != null && current.size() > 1) {
                    legs.put(legToJson(current));
                }
            } else {
                for (RouteSegment seg : segments) {
                    List<LatLng> pts = seg.getLatLngs();
                    if (pts != null && pts.size() > 1) {
                        legs.put(legToJson(pts));
                    }
                }
            }
            res.put("legs", legs);
            call.resolve(res);
        });
    }

    private static JSObject legToJson(List<LatLng> pts) {
        JSArray arr = new JSArray();
        for (LatLng p : pts) {
            JSObject o = new JSObject();
            o.put("lat", p.latitude);
            o.put("lng", p.longitude);
            arr.put(o);
        }
        JSObject leg = new JSObject();
        leg.put("points", arr);
        return leg;
    }

    private List<LatLng> obtenerRutaActual() {
        if (navigator == null) return null;
        RouteSegment seg = navigator.getCurrentRouteSegment();
        return seg != null ? seg.getLatLngs() : null;
    }

    /**
     * Mueve el marcador propio del vehículo sobre el mapa del SDK y centra la
     * cámara en él (con el rumbo). El SDK NUNCA recibe esta ubicación como suya:
     * así no puede detectar off-route → no recalcula. El vehículo lo interpola
     * el front sobre el path exacto (getRouteSegments).
     */
    @PluginMethod
    public void moveVehicle(PluginCall call) {
        final FragmentActivity activity = (FragmentActivity) getActivity();
        activity.runOnUiThread(() -> {
            if (navMap == null) {
                call.reject("Mapa no inicializado");
                return;
            }
            JSONObject data = call.getData();
            if (data == null) {
                call.reject("Datos inválidos");
                return;
            }
            LatLng pos = new LatLng(data.optDouble("lat"), data.optDouble("lng"));
            double bearing = data.optDouble("bearing", 0);
            if (vehicleMarker == null) {
                vehicleMarker =
                        navMap.addMarker(
                                new MarkerOptions()
                                        .position(pos)
                                        .icon(BitmapDescriptorFactory.defaultMarker(
                                                BitmapDescriptorFactory.HUE_AZURE)));
            } else {
                vehicleMarker.setPosition(pos);
            }
            navMap.moveCamera(
                    CameraUpdateFactory.newCameraPosition(
                            new CameraPosition.Builder()
                                    .target(pos)
                                    .bearing((float) bearing)
                                    .tilt(0)
                                    .zoom(16)
                                    .build()));
            call.resolve();
        });
    }

    /**
     * Ancla la ubicación del SDK UNA VEZ en el inicio de la ruta (setUserLocation).
     * Así el SDK "cree" que estamos en el inicio (sobre la ruta) y no usa el GPS
     * del dispositivo; el vehículo visual lo mueve moveVehicle sin alimentarlo.
     */
    @PluginMethod
    public void anclarEn(PluginCall call) {
        if (navigator == null) {
            call.reject("Navigator no inicializado");
            return;
        }
        final double lat = call.getDouble("lat", 0.0);
        final double lng = call.getDouble("lng", 0.0);
        getActivity().runOnUiThread(() -> {
            navigator.getSimulator().setUserLocation(new LatLng(lat, lng));
            call.resolve();
        });
    }

    @PluginMethod
    public void cleanup(PluginCall call) {
        final FragmentActivity activity = (FragmentActivity) getActivity();
        activity.runOnUiThread(() -> {
            removeNavView();
            if (vehicleMarker != null) {
                vehicleMarker.remove();
                vehicleMarker = null;
            }
            if (locationProvider != null) {
                locationProvider.removeLocationListener(locationListener);
                locationProvider = null;
            }
            if (navigator != null) {
                navigator.removeArrivalListener(arrivalListener);
                navigator.removeRouteChangedListener(routeChangedListener);
                navigator.removeReroutingListener(reroutingListener);
                navigator.removeNavigationSessionListener(sessionListener);
                navigator.getSimulator().unsetUserLocation();
                navigator.cleanup();
                navigator = null;
            }
            call.resolve();
        });
    }

    private void addNavView() {
        if (viewAdded || getActivity() == null) return;
        viewAdded = true;

        FragmentActivity activity = (FragmentActivity) getActivity();
        FrameLayout content = activity.findViewById(android.R.id.content);

        navContainer = new FrameLayout(activity);
        navContainer.setId(View.generateViewId());
        content.addView(
                navContainer,
                0,
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
        }

        navView = new NavigationView(activity);
        // Ocultamos TODA la UI nativa del SDK: los overlays (maniobra, sheet, etc.)
        // los renderiza la página Angular en el WebView transparente.
        navView.setNavigationUiEnabled(false);
        navView.setHeaderEnabled(false);
        navView.setEtaCardEnabled(false);
        navView.setSpeedometerEnabled(false);
        navView.setRecenterButtonEnabled(false);
        navView.setTripProgressBarEnabled(false);
        navView.setReportIncidentButtonEnabled(false);
        navView.setTrafficIncidentCardsEnabled(false);
        navView.setTrafficPromptsEnabled(false);
        navView.onCreate(null);
        navView.getMapAsync(map -> navMap = map);
        navContainer.addView(
                navView,
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        navView.onStart();
        navView.onResume();
    }

    private void removeNavView() {
        if (!viewAdded || getActivity() == null) return;
        viewAdded = false;

        if (navView != null) {
            navView.onPause();
            navView.onSaveInstanceState(new Bundle());
            if (navContainer != null) {
                navContainer.removeView(navView);
            }
            navView = null;
        }
        if (navContainer != null) {
            FrameLayout content = getActivity().findViewById(android.R.id.content);
            if (content != null) {
                content.removeView(navContainer);
            }
            navContainer = null;
        }
    }
}

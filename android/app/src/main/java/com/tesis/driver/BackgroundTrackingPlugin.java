package com.tesis.driver;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "BackgroundTracking",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        ),
        @Permission(
            alias = "location",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            }
        )
    }
)
public class BackgroundTrackingPlugin extends Plugin {
    private static BackgroundTrackingPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public static void onLocationReceived(Location location) {
        if (instance != null) {
            JSObject ret = new JSObject();
            ret.put("latitude", location.getLatitude());
            ret.put("longitude", location.getLongitude());
            ret.put("accuracy", location.getAccuracy());
            ret.put("speed", location.hasSpeed() ? location.getSpeed() : 0.0);
            ret.put("bearing", location.hasBearing() ? location.getBearing() : 0.0);
            ret.put("time", location.getTime());
            ret.put("provider", location.getProvider());

            instance.notifyListeners("locationUpdate", ret);
        }
    }

    @PluginMethod
    public void startTracking(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (getPermissionState("notifications") != PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "notificationsCallback");
                return;
            }
        }
        doStartTracking(call);
    }

    @PermissionCallback
    private void notificationsCallback(PluginCall call) {
        doStartTracking(call);
    }

    private void doStartTracking(PluginCall call) {
        Context context = getContext();
        String title = call.getString("title", "BrandIA Driver • Ruta activa");
        String text = call.getString("text", "Transmitiendo ubicación GPS en segundo plano...");

        Intent intent = new Intent(context, LocationForegroundService.class);
        intent.setAction(LocationForegroundService.ACTION_START);
        intent.putExtra(LocationForegroundService.EXTRA_TITLE, title);
        intent.putExtra(LocationForegroundService.EXTRA_TEXT, text);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Error al iniciar el servicio de rastreo: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, LocationForegroundService.class);
        intent.setAction(LocationForegroundService.ACTION_STOP);

        try {
            context.startService(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Error al detener el servicio de rastreo: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void isTracking(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isTracking", LocationForegroundService.isServiceRunning());
        call.resolve(ret);
    }
}

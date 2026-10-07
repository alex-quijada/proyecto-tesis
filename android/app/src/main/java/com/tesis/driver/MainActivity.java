package com.tesis.driver;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundTrackingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

package it.workoutcontrol.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // I plugin locali, a differenza di quelli installati via npm, non
        // passano da `cap sync`: vanno registrati a mano prima del bridge.
        registerPlugin(SuoniNotificaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

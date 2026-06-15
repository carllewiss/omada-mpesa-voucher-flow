package app.lovable.cae1b3003e54411b8fb315a49ade0906;

import app.lovable.sim2sms.Sim2SmsPlugin;
import com.getcapacitor.BridgeActivity;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(Sim2SmsPlugin.class);
    }
}

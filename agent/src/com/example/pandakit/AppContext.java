package com.example.pandakit;

import android.app.Application;
import android.content.Context;

/**
 * Holds a Context for the agent. app_process does not provide an
 * Application object, so the agent obtains a Context via the system
 * ActivityThread (the same trick used by other app_process agents):
 * reflectively call ActivityThread.currentApplication(), falling back
 * to creating a shell Context. Kept deliberately small; the full
 * reflective lookup lives in the original agent's FakeContext helper
 * and is re-implemented here in outline only — fill in the exact
 * lookup for the target Android version when building.
 */
public final class AppContext {
    private static Context context;

    public static Context get() {
        if (context == null) {
            try {
                Class<?> activityThread = Class.forName("android.app.ActivityThread");
                Object thread = activityThread.getMethod("currentApplication").invoke(null);
                if (thread instanceof Application) context = ((Application) thread).getApplicationContext();
            } catch (Exception e) {
                throw new IllegalStateException("No application Context available", e);
            }
        }
        return context;
    }

    private AppContext() {}
}

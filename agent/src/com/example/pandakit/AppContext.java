package com.example.pandakit;

import android.app.Application;
import android.content.Context;
import java.lang.reflect.Method;

/**
 * Holds a Context for the agent.
 *
 * app_process does not create an Application, so
 * ActivityThread.currentApplication() returns null under app_process.
 * The previous version of this file returned null in that case, which
 * made every command that touches the PackageManager (cmd 10/20/100)
 * die with a NullPointerException inside handleListApps — the handler
 * thread died, the socket closed mid-response, and the browser saw
 * "PandaKit 连接已关闭" on the very first read of listApps.
 *
 * The working lookup, in order:
 * 1. currentApplication(), when one exists;
 * 2. currentActivityThread() + getSystemContext();
 * 3. systemMain() + getSystemContext() — creates and attaches the
 *    ActivityThread as the system thread, which is the standard
 *    app_process trick for obtaining a working system Context whose
 *    PackageManager can list packages and load icons.
 */
public final class AppContext {
    private static Context context;

    public static Context get() {
        if (context == null) {
            context = lookup();
        }
        if (context == null) {
            throw new IllegalStateException("No Context available under app_process");
        }
        return context;
    }

    private static Context lookup() {
        try {
            Class<?> activityThread = Class.forName("android.app.ActivityThread");

            // 1. An Application, when one exists.
            try {
                Method currentApplication = activityThread.getMethod("currentApplication");
                Object app = currentApplication.invoke(null);
                if (app instanceof Application) {
                    return ((Application) app).getApplicationContext();
                }
            } catch (Exception ignored) {
                // Fall through to the system context.
            }

            // 2. Existing ActivityThread's system context.
            Object thread = null;
            try {
                Method currentActivityThread = activityThread.getMethod("currentActivityThread");
                thread = currentActivityThread.invoke(null);
            } catch (Exception ignored) {
                // Fall through to systemMain().
            }

            // 3. No thread yet (plain app_process main): create and attach
            //    the system thread, then take its system context.
            if (thread == null) {
                Method systemMain = activityThread.getMethod("systemMain");
                thread = systemMain.invoke(null);
            }
            if (thread != null) {
                Method getSystemContext = activityThread.getMethod("getSystemContext");
                Object systemContext = getSystemContext.invoke(thread);
                if (systemContext instanceof Context) {
                    return (Context) systemContext;
                }
            }
        } catch (Exception e) {
            System.out.println("AppContext lookup failed: " + e);
            e.printStackTrace(System.out);
        }
        return null;
    }

    private AppContext() {}
}

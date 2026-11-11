package com.example.pandakit;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.net.LocalServerSocket;
import android.net.LocalSocket;
import android.os.storage.StorageManager;
import android.os.storage.StorageVolume;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.List;

/**
 * Minimal PandaKit-compatible agent, written from scratch.
 *
 * Listens on the abstract socket "panda-1.1.0" and answers the binary
 * protocol documented in PROTOCOL.md (big-endian ints, length-prefixed
 * strings and byte blocks). Implemented commands: 10 (listApps),
 * 20 (listStorageVolumes), 100 (shellExec).
 *
 * Run with: CLASSPATH=/data/local/tmp/panda-kit.jar app_process / com.example.pandakit.Main
 * Requires an Android runtime (app_process); it will not run on a plain JVM.
 */
public final class Main {
    private static final String SOCKET_NAME = "panda-1.1.0";

    public static void main(String[] args) throws Exception {
        // If another instance is already listening, exit quietly.
        try (LocalSocket probe = new LocalSocket()) {
            probe.connect(new android.net.LocalSocketAddress(SOCKET_NAME));
            System.out.println("Service already running on socket: " + SOCKET_NAME);
            return;
        } catch (IOException ignored) {
            // Nothing listening: start the service below.
        }

        // Daemonise: fork a child that keeps serving after the ADB shell
        // that launched us exits. The parent exits immediately.
        // (Implemented via a second app_process invocation; see forkChild.)
        if (System.getenv("PANDAKIT_CHILD") == null) {
            forkChild();
            return;
        }
        runService();
    }

    private static void forkChild() throws IOException {
        ProcessBuilder pb = new ProcessBuilder(
                "/system/bin/app_process",
                "/",
                Main.class.getName());
        pb.environment().put("CLASSPATH", System.getenv("CLASSPATH"));
        pb.environment().put("PANDAKIT_CHILD", "1");
        pb.redirectOutput(ProcessBuilder.Redirect.INHERIT);
        pb.redirectError(ProcessBuilder.Redirect.INHERIT);
        Process child = pb.start();
        System.out.println("[fork] child PID=" + pidOf(child));
    }

    private static long pidOf(Process process) {
        try {
            return (Long) process.getClass().getMethod("pid").invoke(process);
        } catch (Exception e) {
            return -1;
        }
    }

    private static void runService() throws IOException {
        LocalServerSocket server = new LocalServerSocket(SOCKET_NAME);
        System.out.println("PandaKit replica listening on " + SOCKET_NAME);
        while (true) {
            LocalSocket client = server.accept();
            new Thread(() -> handleClient(client)).start();
        }
    }

    private static void handleClient(LocalSocket socket) {
        try (DataInputStream in = new DataInputStream(socket.getInputStream());
             DataOutputStream out = new DataOutputStream(socket.getOutputStream())) {
            while (true) {
                int command = in.readInt();
                switch (command) {
                    case 10: handleListApps(in, out); break;
                    case 20: handleListStorageVolumes(in, out); break;
                    case 100: handleShellExec(in, out); break;
                    default:
                        System.out.println("Unknown command: " + command);
                        return;
                }
            }
        } catch (IOException e) {
            // Client disconnected; nothing to do.
        } catch (Throwable t) {
            // A command handler must never kill the server silently: log
            // it so the failure is visible instead of the client just
            // seeing the socket close mid-response.
            System.out.println("Command handler failed: " + t);
            t.printStackTrace(System.out);
        } finally {
            try { socket.close(); } catch (IOException ignored) {}
        }
    }

    // ---- helpers: the binary framing used by the protocol ----

    private static void writeString(DataOutputStream out, String value) throws IOException {
        byte[] bytes = value == null ? new byte[0] : value.getBytes("UTF-8");
        out.writeInt(bytes.length);
        out.write(bytes);
    }

    private static String readString(DataInputStream in) throws IOException {
        byte[] bytes = new byte[in.readInt()];
        in.readFully(bytes);
        return new String(bytes, "UTF-8");
    }

    private static void writeBytes(DataOutputStream out, byte[] bytes) throws IOException {
        if (bytes == null) bytes = new byte[0];
        out.writeInt(bytes.length);
        out.write(bytes);
    }

    private static byte[] drawableToPng(Drawable drawable, int sizePx) {
        if (drawable == null) return new byte[0];
        Bitmap bitmap;
        if (drawable instanceof BitmapDrawable) {
            bitmap = ((BitmapDrawable) drawable).getBitmap();
        } else {
            bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            drawable.setBounds(0, 0, sizePx, sizePx);
            drawable.draw(canvas);
        }
        if (bitmap.getWidth() != sizePx || bitmap.getHeight() != sizePx) {
            bitmap = Bitmap.createScaledBitmap(bitmap, sizePx, sizePx, true);
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        return out.toByteArray();
    }

    // ---- cmd 10: listApps ----

    private static void handleListApps(DataInputStream in, DataOutputStream out) throws IOException {
        int densityArg = in.readInt(); // observed call passes 3; kept for compatibility
        int iconSize = in.readInt();   // observed call passes 64
        PackageManager pm = AppContext.get().getPackageManager();
        List<PackageInfo> packages = pm.getInstalledPackages(0);
        writeBytes(out, new byte[0]); // defaultIcon: none in this minimal agent
        out.writeInt(packages.size());
        for (PackageInfo info : packages) {
            ApplicationInfo app = info.applicationInfo;
            writeString(out, info.packageName);
            writeString(out, info.versionName == null ? "" : info.versionName);
            out.writeLong(info.versionCode);
            writeString(out, String.valueOf(pm.getApplicationLabel(app)));
            out.writeInt(0); // installTime (not tracked here)
            out.writeInt(0); // updateTime
            out.writeInt(0); // lastUsedTime
            writeString(out, ""); // installer
            writeString(out, ""); // cpuArch
            out.writeInt(app.targetSdkVersion);
            out.writeInt(app.minSdkVersion);
            out.writeInt(app.flags);
            out.writeBoolean(false); // hasSplits
            out.writeBoolean(pm.getLaunchIntentForPackage(info.packageName) != null);
            out.writeLong(0); // appSize
            out.writeLong(0); // dataSize
            out.writeLong(0); // cacheSize
            byte[] icon = new byte[0];
            try { icon = drawableToPng(pm.getApplicationIcon(app), iconSize); } catch (Exception ignored) {}
            writeBytes(out, icon);
        }
        out.flush();
    }

    // ---- cmd 20: listStorageVolumes ----

    private static void handleListStorageVolumes(DataInputStream in, DataOutputStream out) throws IOException {
        StorageManager sm = AppContext.get().getSystemService(StorageManager.class);
        List<StorageVolume> volumes = sm.getStorageVolumes();
        out.writeInt(volumes.size());
        for (StorageVolume volume : volumes) {
            out.writeInt(volume.isPrimary() ? 0 : 1);
            writeString(out, volume.getDescription(AppContext.get()));
            writeString(out, volume.getDirectory() == null ? "" : volume.getDirectory().getAbsolutePath());
        }
        out.flush();
    }

    // ---- cmd 100: shellExec ----

    private static void handleShellExec(DataInputStream in, DataOutputStream out) throws IOException {
        String command = readString(in);
        String result;
        try {
            Process process = Runtime.getRuntime().exec(new String[]{"sh", "-c", command});
            java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int read;
            java.io.InputStream input = process.getInputStream();
            while ((read = input.read(chunk)) != -1) buffer.write(chunk, 0, read);
            process.waitFor();
            result = new String(buffer.toByteArray(), "UTF-8");
        } catch (Exception e) {
            result = e.toString();
        }
        writeString(out, result);
        out.flush();
    }
}

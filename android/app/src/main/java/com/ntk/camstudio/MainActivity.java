package com.ntk.camstudio;

import android.Manifest;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class MainActivity extends BridgeActivity {

    private static final int REQUEST_MEDIA_PERMISSIONS = 1042;

    private static final class PendingSave {
        final File tempFile;
        final String filename;
        final String mimeType;
        final FileOutputStream stream;

        PendingSave(File tempFile, String filename, String mimeType, FileOutputStream stream) {
            this.tempFile = tempFile;
            this.filename = filename;
            this.mimeType = mimeType;
            this.stream = stream;
        }
    }

    private final Map<String, PendingSave> pendingSaves = new ConcurrentHashMap<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestInitialMediaPermissions();

        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            webView.addJavascriptInterface(new NTKAndroidBridge(), "NTKAndroidBridge");
        }
    }

    @Override
    public void onDestroy() {
        for (PendingSave save : pendingSaves.values()) {
            try {
                save.stream.close();
            } catch (Exception ignored) {}
            if (save.tempFile.exists()) {
                //noinspection ResultOfMethodCallIgnored
                save.tempFile.delete();
            }
        }
        pendingSaves.clear();
        super.onDestroy();
    }

    private void requestInitialMediaPermissions() {
        boolean hasCam =
            ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
        boolean hasMic =
            ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED;

        if (!hasCam || !hasMic) {
            ActivityCompat.requestPermissions(
                this,
                new String[] { Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO },
                REQUEST_MEDIA_PERMISSIONS
            );
        }
    }

    private void applySystemBarTheme(String resolved) {
        final boolean isDark = !"light".equalsIgnoreCase(resolved);
        runOnUiThread(() -> {
            Window window = getWindow();
            if (window == null) return;
            int barColor = Color.parseColor(isDark ? "#0B0C0F" : "#FFFFFF");
            window.setStatusBarColor(barColor);
            window.setNavigationBarColor(barColor);
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
                window,
                window.getDecorView()
            );
            if (controller != null) {
                controller.setAppearanceLightStatusBars(!isDark);
                controller.setAppearanceLightNavigationBars(!isDark);
            }
        });
    }

    private static String sanitizeFilename(String rawName) {
        if (rawName == null || rawName.trim().isEmpty()) {
            return "ntk-cam-studio-export.bin";
        }
        return rawName.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
    }

    public final class NTKAndroidBridge {

        @JavascriptInterface
        public void setTheme(String resolved) {
            applySystemBarTheme(resolved);
        }

        @JavascriptInterface
        public String beginSaveFile(String filename, String mimeType) {
            try {
                String safeName = sanitizeFilename(filename);
                String safeMime = (mimeType == null || mimeType.trim().isEmpty())
                    ? "application/octet-stream"
                    : mimeType.trim();
                File cacheDir = new File(getCacheDir(), "ntk_exports");
                if (!cacheDir.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    cacheDir.mkdirs();
                }
                String id = UUID.randomUUID().toString();
                File tempFile = new File(cacheDir, id + "_" + safeName);
                FileOutputStream fos = new FileOutputStream(tempFile, false);
                pendingSaves.put(id, new PendingSave(tempFile, safeName, safeMime, fos));
                return id;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean appendSaveFileChunk(String transferId, String base64Chunk) {
            PendingSave save = pendingSaves.get(transferId);
            if (save == null || base64Chunk == null) return false;
            try {
                byte[] decoded = Base64.decode(base64Chunk, Base64.DEFAULT);
                save.stream.write(decoded);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public String finishSaveFile(String transferId) {
            PendingSave save = pendingSaves.remove(transferId);
            if (save == null) return "";
            try {
                save.stream.flush();
                save.stream.close();

                String savedDisplayPath = "Downloads/NTK Cam Studio/" + save.filename;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, save.filename);
                    values.put(MediaStore.Downloads.MIME_TYPE, save.mimeType);
                    values.put(
                        MediaStore.Downloads.RELATIVE_PATH,
                        Environment.DIRECTORY_DOWNLOADS + "/NTK Cam Studio"
                    );
                    values.put(MediaStore.Downloads.IS_PENDING, 1);

                    Uri itemUri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (itemUri == null) {
                        return "";
                    }
                    try (
                        InputStream in = new FileInputStream(save.tempFile);
                        OutputStream out = getContentResolver().openOutputStream(itemUri)
                    ) {
                        if (out == null) {
                            getContentResolver().delete(itemUri, null, null);
                            return "";
                        }
                        byte[] buf = new byte[16384];
                        int len;
                        while ((len = in.read(buf)) > 0) {
                            out.write(buf, 0, len);
                        }
                    }
                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(itemUri, values, null, null);
                } else {
                    File downloadsRoot = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS
                    );
                    File targetDir = new File(downloadsRoot, "NTK Cam Studio");
                    if (!targetDir.exists()) {
                        //noinspection ResultOfMethodCallIgnored
                        targetDir.mkdirs();
                    }
                    File targetFile = new File(targetDir, save.filename);
                    try (
                        InputStream in = new FileInputStream(save.tempFile);
                        OutputStream out = new FileOutputStream(targetFile, false)
                    ) {
                        byte[] buf = new byte[16384];
                        int len;
                        while ((len = in.read(buf)) > 0) {
                            out.write(buf, 0, len);
                        }
                    }
                    savedDisplayPath = targetFile.getAbsolutePath();
                }

                final String toastMsg = "Saved to " + savedDisplayPath;
                runOnUiThread(() ->
                    Toast.makeText(MainActivity.this, toastMsg, Toast.LENGTH_SHORT).show()
                );
                return savedDisplayPath;
            } catch (Exception e) {
                return "";
            } finally {
                if (save.tempFile.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    save.tempFile.delete();
                }
            }
        }

        @JavascriptInterface
        public void abortSaveFile(String transferId) {
            PendingSave save = pendingSaves.remove(transferId);
            if (save == null) return;
            try {
                save.stream.close();
            } catch (Exception ignored) {}
            if (save.tempFile.exists()) {
                //noinspection ResultOfMethodCallIgnored
                save.tempFile.delete();
            }
        }
    }
}

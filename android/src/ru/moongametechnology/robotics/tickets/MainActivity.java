package ru.moongametechnology.robotics.tickets;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Offline website wrapper. No network permissions or JavaScript/native bridge. */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/assets/index.html";
    private static final String ABOUT = "https://" + HOST + "/assets/privacy.html";
    private static final Set<String> ASSETS = new HashSet<>(Arrays.asList(
        "index.html", "privacy.html", "style.css", "app.js", "core.js", "android-adapter.js",
        "circuits-core.js", "circuits-data.js", "circuits-ui.js",
        "data/question_bank.json", "data/interview_paths.json", "data/beginner_tickets.json",
        "data/tickets.json", "data/study_plan.json"
    ));
    private WebView webView;

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        PackageInfo provider = WebView.getCurrentWebViewPackage();
        if (provider != null) {
            try {
                int major = Integer.parseInt(provider.versionName.split("\\.")[0]);
                if (major < 80) {
                    new AlertDialog.Builder(this)
                        .setTitle("Обновите компонент Android")
                        .setMessage("Для тренажёра нужен Android System WebView версии 80 или новее. Обновите его через магазин приложений, затем откройте тренажёр.")
                        .setPositiveButton("Понятно", (dialog, which) -> finish())
                        .setOnCancelListener(dialog -> finish()).show();
                    return;
                }
            } catch (NumberFormatException ignored) { }
        }
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(18, 53, 74));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, windowInsets) -> {
                Insets bars = windowInsets.getInsets(WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        root.requestApplyInsets();
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBlockNetworkLoads(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setTextZoom(Math.round(getResources().getConfiguration().fontScale * 100));
        WebView.setWebContentsDebuggingEnabled(false);
        webView.setBackgroundColor(Color.rgb(241, 245, 248));
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new LocalClient());
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
        String previous = savedState == null ? null : savedState.getString("page");
        webView.loadUrl(previous != null && allowedPage(Uri.parse(previous)) ? previous : HOME);
    }

    private static boolean localOrigin(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
            && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    private static boolean allowedPage(Uri uri) {
        return localOrigin(uri) && ("/assets/index.html".equals(uri.getPath())
            || "/assets/privacy.html".equals(uri.getPath()));
    }

    private void openExternal(Uri uri) {
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri)
                .addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, "На устройстве не найден браузер для открытия ссылки.",
                Toast.LENGTH_LONG).show();
        }
    }

    private final class LocalClient extends WebViewClient {
        @Override public WebResourceResponse shouldInterceptRequest(
                WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!localOrigin(uri) || !"GET".equals(request.getMethod())) return error(403);
            String path = uri.getPath();
            if (path == null || !path.startsWith("/assets/")) return error(404);
            String name = path.substring("/assets/".length());
            if (!ASSETS.contains(name)) return error(404);
            try {
                InputStream data = getAssets().open("site/" + name);
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                headers.put("X-Content-Type-Options", "nosniff");
                headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; "
                    + "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; "
                    + "object-src 'none'; base-uri 'none'; frame-src 'none'");
                String mime = name.endsWith(".js") ? "application/javascript"
                    : name.endsWith(".json") ? "application/json"
                    : name.endsWith(".css") ? "text/css" : "text/html";
                return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, data);
            } catch (IOException ignored) { return error(404); }
        }

        @Override public boolean shouldOverrideUrlLoading(
                WebView view, WebResourceRequest request) {
            if (allowedPage(request.getUrl())) return false;
            if (request.isForMainFrame() && request.hasGesture()) openExternal(request.getUrl());
            return true;
        }

        @Override public void onReceivedError(WebView view, WebResourceRequest request,
                android.webkit.WebResourceError error) {
            if (!request.isForMainFrame()) return;
            new AlertDialog.Builder(MainActivity.this)
                .setTitle("Не удалось открыть тренажёр")
                .setMessage("Закройте и откройте приложение ещё раз. Сохранённые ответы останутся на устройстве.")
                .setPositiveButton("Закрыть", (dialog, which) -> finish()).show();
        }
    }

    private static WebResourceResponse error(int status) {
        byte[] text = "Local resource unavailable".getBytes(StandardCharsets.UTF_8);
        return new WebResourceResponse("text/plain", "UTF-8", status,
            status == 403 ? "Forbidden" : "Not Found", Collections.emptyMap(),
            new ByteArrayInputStream(text));
    }

    private void handleBack() {
        if (webView == null) { finish(); return; }
        String page = webView.getUrl();
        if (page != null && page.startsWith(ABOUT)) {
            if (webView.canGoBack()) webView.goBack();
            else webView.loadUrl(HOME);
            return;
        }
        webView.evaluateJavascript(
            "Boolean(window.roboticsNativeBack && window.roboticsNativeBack())",
            result -> { if (!"true".equals(result)) finish(); });
    }

    @Override @SuppressWarnings("deprecation") public void onBackPressed() { handleBack(); }

    @Override public void onSaveInstanceState(Bundle state) {
        if (webView != null) state.putString("page", webView.getUrl());
        super.onSaveInstanceState(state);
    }

    @Override public void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override public void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override public void onDestroy() {
        if (webView != null) {
            ((FrameLayout) webView.getParent()).removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

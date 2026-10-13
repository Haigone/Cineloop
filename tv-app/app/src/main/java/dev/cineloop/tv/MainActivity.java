package dev.cineloop.tv;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.KeyEvent;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.widget.TextView;
import android.view.Gravity;
import android.graphics.Typeface;
import android.view.ViewGroup;

public class MainActivity extends Activity {
    private WebView webView;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String url = BuildConfig.CINELOOP_TV_URL;
        if (url == null || url.trim().isEmpty() || !url.startsWith("https://")) {
            showSetupMessage();
            return;
        }

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.setBackgroundColor(Color.rgb(8, 9, 13));
        setContentView(webView);
        webView.loadUrl(url);
    }

    private void showSetupMessage() {
        TextView message = new TextView(this);
        message.setText("CineLoop TV\n\nQuesta build non è ancora collegata al sito.\nGenera l'APK con -PcineloopUrl=https://il-tuo-sito/tv");
        message.setTextColor(Color.WHITE);
        message.setTextSize(22);
        message.setGravity(Gravity.CENTER);
        message.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        message.setBackgroundColor(Color.rgb(8, 9, 13));
        setContentView(message, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

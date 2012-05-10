package org.laptop.nell.balloons;

import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.apache.cordova.*;

public class BalloonsActivity extends DroidGap {
    /** Called when the activity is first created. */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        super.setIntegerProperty("splashscreen", R.drawable.splash);
        super.setBooleanProperty("keepRunning", false);
        super.loadUrl("file:///android_asset/www/index.html", 2500);
    }
    @Override
    public void init(WebView webView, WebViewClient webViewClient, WebChromeClient webChromeClient) {
        super.init(webView, webViewClient, webChromeClient);
        // ensure that our app can tell it's running under PhoneGap
        this.appView.addJavascriptInterface("Android", "cordovaDetect");
    }
}

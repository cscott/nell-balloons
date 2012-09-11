// encapsulate Funf functionality
define(['./webintent'], function(WebIntent) {

    var FUNF_ACTION_RECORD = 'edu.mit.media.funf.RECORD';
    var FUNF_ACTION_ARCHIVE = 'edu.mit.media.funf.ARCHIVE';
    var FUNF_DATABASE_NAME = 'mainPipeline';

    var Funf = function(appName) {
        console.assert(appName.indexOf('-') < 0,
                       "funf doesn't like hyphens in the appName");
        this.appName = appName;
    };
    Funf.prototype = {};
    Funf.prototype.record = function(name, value) {
        console.log('CSA FUNF '+name+' / '+value);
        try {
            // send custom event; there's a Firefox add-on which will
            // turn this into an Android Intent:
            //     https://github.com/cscott/intent-addon
            var event = document.createEvent('CustomEvent');
            var o = { name: name, value: value, millis: Date.now() };
            var intent = {
                action: FUNF_ACTION_RECORD,
                method: 'sendBroadcast',
                extras: {
                    DATABASE_NAME: FUNF_DATABASE_NAME,
                    TIMESTAMP: Math.floor(Date.now()/1000),
                    NAME: this.appName,
                    VALUE: JSON.stringify(o)
                }
	    };
            event.initCustomEvent("intent-addon", true, true, intent);
	    document.documentElement.dispatchEvent(event);
        } catch(e) {
            console.log("Sending custom event failed: "+e);
        }
    };
    Funf.prototype.archive = function() {
        try {
            var event = document.createEvent('CustomEvent');
            var intent = {
                action: FUNF_ACTION_ARCHIVE,
                method: 'sendBroadcast',
                extras: {
                    DATABASE_NAME: FUNF_DATABASE_NAME
                }
	    };
            event.initCustomEvent("intent-addon", true, true, intent);
	    document.documentElement.dispatchEvent(event);
        } catch(e) {
            console.log("Sending custom event failed: "+e);
        }
    };
    // redefine these methods if running on PhoneGap/Android
    if (window &&
        window.Cordova && window.Cordova.exec &&
        window.device && window.device.platform==='Android') {
        Funf.prototype.record = function(name, value) {
            if (typeof value === 'object' /* includes arrays */) {
                // protect complex values from funf flattening
                value = JSON.stringify(value);
            }
            var wi = new WebIntent();
            var o = { name:name, value:value, millis: Date.now() };
            wi.sendBroadcast({
                action: FUNF_ACTION_RECORD,
                extras: {
                    DATABASE_NAME: FUNF_DATABASE_NAME,
                    TIMESTAMP: Math.floor(Date.now()/1000),
                    NAME: this.appName,
                    VALUE: JSON.stringify(o)
                }
            }, function(args) { /* success */ }, function(args) {
                console.error('Funf logging failed.');
            });
        };
        Funf.prototype.archive = function() {
            new WebIntent().sendBroadcast({
                action: FUNF_ACTION_ARCHIVE,
                extras: {
                    DATABASE_NAME: FUNF_DATABASE_NAME
                }
            }, function(){}, function(){});
        };
    }
    return Funf;
});

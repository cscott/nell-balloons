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
    Funf.prototype.record = function(name, value) { /* ignore */ };
    Funf.prototype.archive = function() { /* ignore */ };
    // only define these methods if running on Android
    if (window &&
        window.Cordova && window.Cordova.exec &&
        window.device && window.device.platform==='Android') {
        Funf.prototype.record = function(name, value) {
            var wi = new WebIntent();
            var o = { name:name, value:value };
            wi.sendBroadcast({
                action: FUNF_ACTION_RECORD,
                extras: {
                    DATABASE_NAME: FUNF_DATABASE_NAME,
                    TIMESTAMP: Date.now(),
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

// use the requirejs plugin interface so that we can delay startup until the
// lawnchair has loaded.
define(['./lawnchair/lawnchair'], function(Lawnchair) {

    var getDefault = function(lawnchair, key, defaultValue, callback) {
        lawnchair.exists(key, function(exists) {
            if (exists) {
                lawnchair.get(key, callback);
            } else {
                callback(defaultValue);
            }
        });
    };

    var Score = function(lawnchair, unlocked) {
        this.lawnchair = lawnchair;
        this.unlocked = unlocked || {};
    };
    Score.prototype = {};
    Score.prototype._get = function(level, altitude, create) {
        if (!this.unlocked[level]) {
            if (!create) { return {}; }
            this.unlocked[level] = {};
        }
        if (!this.unlocked[level][altitude]) {
            if (!create) { return {}; }
            this.unlocked[level][altitude] = {};
        }
        return this.unlocked[level][altitude];
    };
    Score.prototype.isCompleted = function(level, altitude) {
        return !!(this._get(level, altitude).firstCompleted);
    };
    Score.prototype.numStars = function(level, altitude) {
        return this._get(level, altitude).numStars || 0;
    };
    Score.prototype.setCompleted = function(level, altitude, numStars) {
        var info = this._get(level, altitude, true/*create*/);
        var prevStars = (info.numStars || 0);
        var isNew = (!info.firstCompleted) || (numStars > prevStars);
        if (!isNew) { return; }
        // new high score / not previously unlocked
        if (!info.firstCompleted) { info.firstCompleted = Date.now(); }
        info.lastCompleted = Date.now();
        info.numStars = numStars;
        if (this.funf) {
            this.funf.record('unlocked', {
                level:level,
                altitude:altitude,
                numStars: numStars,
                firstCompleted: info.firstCompleted
            });
        }
        this.save();
    };
    Score.prototype.save = function() {
        this.lawnchair.save({key: 'unlocked', value: this.unlocked});
    };

    var makeScoreAsync = function(callback) {
        var withLawnchair = function(lawnchair) {
            getDefault(lawnchair, 'unlocked', {}, function(unlocked) {
                callback(new Score(lawnchair, unlocked.value));
            });
        };
        Lawnchair({name:'score'}, function() { withLawnchair(this); });
    };

    return {
        load: function(name, req, onLoad, config) {
            if (config.isBuild || typeof document==='undefined') {
                // indicate that this plugin can't be inlined
                onLoad(null);
            } else {
                makeScoreAsync(onLoad);
            }
        }
    };
});

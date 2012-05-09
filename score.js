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

    var compare = function(scorea, scoreb) {
        // scores are arrays.  compare from last element to first
        if (scorea.length !== scoreb.length) {
            return scorea.length - scoreb.length;
        }
        var n = scorea.length-1;
        for ( ; n>=0; n--) {
            if (scorea[n] !== scoreb[n]) {
                return scorea[n] - scoreb[n];
            }
        }
        return 0;
    };

    var Score = function(lawnchair, best, bestTime, recent, recentTime) {
        this.lawnchair = lawnchair;
        this.best = best;
        this.bestTime = bestTime;
        this.recent = recent;
        this.recentTime = recentTime;
    };
    Score.prototype = {};
    Score.prototype.save = function(nscore) {
        this.recent = nscore;
        this.recentTime = Date.now();
        this.lawnchair.save({key: 'recent', value: this.recent,
                        timestamp: this.recentTime}, function(){});
        // is this a new high score?
        if ((!this.best) || compare(nscore, this.best) > 0) {
            this.best = this.recent;
            this.bestTime = this.recentTime;
            this.lawnchair.save({key: 'best', value: this.best,
                            timestamp: this.bestTime}, function(){});
            if (this.funf) {
                // XXX work around bug in db2csv script which flattens
                // the array into 10 separate 'highscore' entries if
                // we don't convert this.best from an array to a string
                this.funf.record('highscore', ""+this.best);
            }
        }
    };

    var makeScoreAsync = function(callback) {
        var withLawnchair = function(lawnchair) {
            getDefault(lawnchair, 'best', null, function(best) {
                getDefault(lawnchair, 'recent', null, function(recent) {
                    callback(new Score(lawnchair,
                                       best && best.value,
                                       best && best.timestamp,
                                       recent && recent.value,
                                       recent && recent.timestamp));
                });
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

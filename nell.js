// use the requirejs plugin interface so that we can delay startup until the
// lawnchair has loaded.
define(['./alea', './lawnchair/lawnchair'], function(Alea, Lawnchair) {
    var NELL_COLORS = [ 'n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8',
                        'n9', 'n10' ];
    var random = Alea.Random();

    var getDefault = function(lawnchair, key, defaultValue, callback) {
        lawnchair.exists(key, function(exists) {
            if (exists) {
                lawnchair.get(key, callback);
            } else {
                callback(defaultValue);
            }
        });
    };

    var Nell = function(lawnchair, color) {
        this.lawnchair = lawnchair;
        if (color) {
            this.setColor(color);
        } else {
            this.setColor(random.choice(NELL_COLORS));
            this.saveColor();
        }
    };
    Nell.prototype = {};
    Nell.prototype.setColor = function(color) {
        this.color = color;
        document.getElementById('nell').className = this.color;
    };
    Nell.prototype.saveColor = function() {
        this.lawnchair.save({ key:'color', value: this.color,
                              timestamp: Date.now() }, function(){});
    };
    Nell.prototype.switchColor = function() {
        var otherColors = NELL_COLORS.filter(function(c) {
            return c !== this.color;
        }.bind(this));
        this.setColor(random.choice(otherColors));
        this.saveColor();
        if (this.funf) {
            this.funf.record('colorchange', this.color);
        }
    };

    var makeNellAsync = function(callback) {
        var withLawnchair = function(lawnchair) {
            getDefault(lawnchair, 'color', null, function(color) {
                callback(new Nell(lawnchair, color && color.value));
            });
        };
        Lawnchair({name:'nell'}, function() { withLawnchair(this); });
    };

    return {
        load: function(name, req, onLoad, config) {
            if (config.isBuild || typeof document==='undefined') {
                // indicate that this plugin can't be inlined
                onLoad(null);
            } else {
                makeNellAsync(onLoad);
            }
        }
    };
});

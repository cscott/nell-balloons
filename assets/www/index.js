define(['domReady!', './alea', './buzz', './compat', './hammer', './webintent.js'], function(document, Alea, Buzz, Compat, Hammer, WebIntent) {
    var MUSIC_URL = 'sounds/barrios_gavota';
    var COLORS = [ 'black', 'lilac', 'orange', 'yellow' ]; // also 'white'
    var MIN_BALLOON_SPEED_Y = 50;
    var MAX_BALLOON_SPEED_Y = 1000;
    var X_SPEED_FRACTION = 0.25; // fraction of y speed

    var initialBalloonSpeedY = MIN_BALLOON_SPEED_Y;

    var NUM_BALLOONS = 2;
    var ENABLE_ACCEL = true;
    var random = Alea.Random();
    var gameElement = document.getElementById('game');
    var buttonsElement = document.getElementById('buttons');
    var balloonsElement = document.getElementById('balloons');
    var buttons, handleButtonPress;

    var funf = function(name, value) {
        // xxx this would break on iOS phonegap
        if (!(window.Cordova && window.Cordova.exec)) {
            return; /* not running on PhoneGap/Android */
        }
        var wi = new WebIntent();
        wi.startActivity({
            action: 'edu.mit.media.funf.RECORD',
            extras: {
                DATABASE_NAME: 'mainPipeline',
                TIMESTAMP: Date.now(),
                NAME: 'nell-balloons.'+name,
                VALUE: value
            }
        }, function() {/*success*/}, function(){
            console.error('Funf logging failed.');
        });
    };

    var ColoredElement = function(element, color) {
        this.init(element, color);
    };
    ColoredElement.prototype = {};
    ColoredElement.prototype.init = function(element, color) {
        this.domElement = element;
        this.domElement.classList.add(color);
        this.color = color;
    };
    ColoredElement.prototype.reset = function(color) {
        this.domElement.classList.remove(this.color);
        this.domElement.classList.add(color);
        this.color = color;
    };
    ColoredElement.prototype.attach = function(parent) {
        parent.appendChild(this.domElement);
    };
    ColoredElement.prototype.detach = function() {
        this.domElement.parentElement.removeChild(this.domElement);
    };

    var Button = function(color) {
        ColoredElement.prototype.init.call(this, document.createElement('a'),
                                           color);
        this.domElement.href='#';
        this.attach(buttonsElement);
        ['mousedown', 'touchstart'].forEach(function(evname) {
            this.domElement.addEventListener(evname,this.highlight.bind(this));
        }.bind(this));
        ['mouseup','mouseout','touchcancel','touchend'].forEach(function(evname){
            this.domElement.addEventListener(evname, this.unhighlight.bind(this));
        }.bind(this));
    };
    Button.prototype = Object.create(ColoredElement.prototype);
    Button.prototype.highlight = function(event) {
        this.domElement.classList.add('hover');
        event.preventDefault();
    };
    Button.prototype.unhighlight = function(event) {
        this.domElement.classList.remove('hover');
        event.preventDefault();
        if (event.type !== 'touchcancel' &&
            event.type !== 'mouseout') {
            handleButtonPress(this.color);
        }
    };

    var Balloon = function(color) {
        color = color || random.choice(buttons).color;
        ColoredElement.prototype.init.call(this, document.createElement('div'),
                                           color);
        this.attach(balloonsElement);
        // starting x, y, and speed
        // pick a random x position
        this.maxx = balloonsElement.offsetWidth - this.domElement.offsetWidth;
        this.reset(this.color); // set random bits.
        this.refresh();
    };
    Balloon.prototype = Object.create(ColoredElement.prototype);
    Balloon.prototype.reset = function(color) {
        color = color || random.choice(buttons).color;
        if (color !== this.color) {
            ColoredElement.prototype.reset.call(this, color);
        }
        this.x = Math.floor(random() * this.maxx);
        this.y = balloonsElement.offsetHeight;
        // speeds are in pixels / second.
        this.speedy = (0.9+0.2*random()) * initialBalloonSpeedY;
        this.speedx = (2*random()-1) * this.speedy * X_SPEED_FRACTION;
        this.popped = this.popDone = false;
        this.domElement.style.top = '0px';
        this.domElement.style.left = '0px';
        this.domElement.classList.remove('popped');
        this.domElement.classList.remove('squirt');
        // just in case element sizes change
        this.maxx = balloonsElement.offsetWidth - this.domElement.offsetWidth;
    };
    Balloon.prototype.refresh = function() {
        if (this.popped) { return; }
        // the 'translateZ' is actually very important here: it enables
        // GPU acceleration of this transform.
        var transform = 'translateX('+Math.round(this.x)+'px) translateY('+Math.round(this.y)+'px) translateZ(0)';
        this.domElement.style.WebkitTransform =
            this.domElement.style.MozTransform =
            this.domElement.style.transform = transform;
    };
    Balloon.prototype.update = function(dt /* milliseconds */) {
        if (this.popped) {
            // don't move after it's popped.
            this.popTimeout -= dt;
            if (this.popTimeout < 0) {
                this.popDone = true;
            }
            return;
        }
        this.y -= dt * this.speedy / 1000;
        this.x += dt * this.speedx / 1000;
        if (this.x < 0) {
            this.x = 0; this.speedx = 0;
        }
        if (this.x > this.maxx) {
            this.x = this.maxx; this.speedx = 0;
        }
        // XXX drift x left and right?
    };
    Balloon.prototype.isGone = function() {
        // returns true if balloon has floated past top of screen
        return (this.y < -this.domElement.offsetHeight) || this.popDone;
    };
    Balloon.prototype.pop = function() {
        this.popped = true;
        // run popping animation & sound effect
        var isSquirt = (random() < (1/15)); // 1-in-15 chance of a squirt
        // play balloon burst sound
        playSoundClip(random.choice(isSquirt ? SQUIRT_SOUNDS : BURST_SOUNDS));

        if (isSquirt) {
            this.domElement.classList.add('squirt');
            this.domElement.style.left = Math.round(this.x)+'px';
            this.domElement.style.top = Math.round(this.y)+'px';
            this.domElement.style.WebkitTransform =
                this.domElement.style.MozTransform =
                this.domElement.style.transform = '';
            this.popTimeout = 3000; // ms
        } else {
            this.domElement.classList.add('popped');
            this.popTimeout = 250; // ms
        }
    };

    buttons = [];
    var createButtons = function() {
        // remove any existing buttons
        while (buttons.length > 0) {
            b = buttons.pop();
            b.detach();
            // XXX remove event handlers?
        }
        // now create four new buttons
        var c = COLORS.slice(0); // make a copy
        random.shuffle(c);
        c.forEach(function(color) {
            var b = new Button(color);
            buttons.push(b);
            // add event handlers
        });
    };
    createButtons();

    var balloons = [];
    while (balloons.length < NUM_BALLOONS) {
        balloons.push(new Balloon());
        // xxx spread out y starting locations
    }

    // let accelerometer influence drift
    if (navigator.accelerometer && ENABLE_ACCEL) {
        var updateAcceleration = function(a) {
            if (a.y < -4) {
                balloons.forEach(function(b) { b.speedx -= 50; });
            } else if (a.y > 4) {
                balloons.forEach(function(b) { b.speedx += 50; });
            }
        };
        navigator.accelerometer.watchAcceleration(updateAcceleration,
                                                  function() {},
                                                  { frequency: 80 });
    }

    var music;
    var playMusicPhoneGap = function(src) {
        var loop = function() {
            music.seekTo(0);
            music.play();
        };
        music = new Media('/android_asset/www/'+src+'.ogg', loop);
        music.play();
    };
    var stopMusicPhoneGap = function() {
        music.stop();
        music.release();
        music = null;
    };
    var playMusicHTML5 = function(src) {
        music = new Buzz.sound(src, { formats: ['ogg','mp3'] });
        music.loop().play();
    };
    var stopMusicHTML5 = function() {
        music.unloop(); // helps on firefox
        music.stop();
        music = null;
    };
    var playMusic = (typeof Media !== 'undefined') ? playMusicPhoneGap :
        Buzz.isSupported() ? playMusicHTML5 : function() { /* ignore */ };
    var stopMusic = (typeof Media !== 'undefined') ? stopMusicPhoneGap :
        Buzz.isSupported() ? stopMusicHTML5 : function() { /* ignore */ };

    var playSoundClipPhoneGap = function(url) {
        var media = new Media('/android_asset/www/'+url+'.ogg',
                              function() { media.release(); },
                              function(error) { console.error(error.code+": "+error.message); });
        media.play();
    };
    var playSoundClipHTML5 = function(url) {
        var sound = new Buzz.sound(url, { formats: ['ogg','mp3'] });
        sound.play();
    };
    var playSoundClip = (typeof Media !== 'undefined') ? playSoundClipPhoneGap :
        Buzz.isSupported() ? playSoundClipHTML5 : function() { /* ignore */ };

    var BURST_SOUNDS = ['sounds/burst1',
                        'sounds/burst2',
                        'sounds/burst3',
                        'sounds/burst4',
                        'sounds/burst5',
                        'sounds/burst6',
                        'sounds/burst7'];
    var SQUIRT_SOUNDS = ['sounds/deflate1',
                         'sounds/deflate2'];

    // smoothing factor -- closer to 0 means more weight on present
    var CORRECT_SMOOTHING = 0.8;
    // number of correct answers as fraction of total (weighted average)
    var correctFraction = 0;
    // milliseconds per correct answer (weighted average)
    var correctTime = 10000;
    // time of last correct answer
    var lastTime = Date.now();

    var adjustSpeeds = function(correctTime, correctFraction) {
        // try to adjust speed such that:
        // (a) correctFraction is about 80%
        // (b) the balloon travels 80% up the screen in 'correctTime' ms.
        var aspeed = Math.max(correctFraction/0.8, 0.8) * initialBalloonSpeedY;
        var bspeed = (balloonsElement.offsetHeight * 0.8) /
            ((correctTime / 1000) * NUM_BALLOONS);
        var avg = (aspeed + bspeed) / 2;
        // only allow it to speed up/slow down by factor of 1.2 each time
        var ADJ_FACTOR = 1.2;
        var minnew = Math.max(initialBalloonSpeedY / ADJ_FACTOR,
                              MIN_BALLOON_SPEED_Y);
        var maxnew = Math.min(initialBalloonSpeedY * ADJ_FACTOR,
                              MAX_BALLOON_SPEED_Y);
        initialBalloonSpeedY = Math.max(minnew, Math.min(maxnew, avg));
    };

    var correctAnswer = function(color) {
        funf('correct', color);
        // maintain weighted averages
        var now = Date.now();
        correctTime = CORRECT_SMOOTHING * correctTime +
            (1-CORRECT_SMOOTHING) * (now - lastTime);
        lastTime = now;
        correctFraction = CORRECT_SMOOTHING * correctFraction +
            (1-CORRECT_SMOOTHING);
        // adjust speeds based on new fractions
        adjustSpeeds(correctTime, correctFraction);
    };
    var incorrectAnswer = function(how) {
        funf('incorrect', how);
        // XXX penalty -- lose some rewards?

        // maintain weighted averages
        var now = Date.now();
        // correctTime will be at least this low, maybe lower.
        var correctTimeCopy = CORRECT_SMOOTHING * correctTime +
            (1 - CORRECT_SMOOTHING) * (lastTime - now);
        correctFraction = CORRECT_SMOOTHING * correctFraction;

        // adjust speeds based on new fractions
        adjustSpeeds(Math.min(correctTime, correctTimeCopy), correctFraction);
    };

    handleButtonPress = function(color) {
        // remove the highest balloon of that color
        var i, b, best=null;
        for (i=0; i<balloons.length; i++) {
            b = balloons[i];
            if (b.color === color && !b.isGone() && !b.popped) {
                if (best===null || b.y < best.y) {
                    best = b;
                }
            }
        }
        if (best===null) {
            incorrectAnswer('click.'+color);
        } else {
            best.pop();
            correctAnswer(color);
        }
    };

    var onPause = function() {
        funf('status', 'pause');
        stopMusic();
    };
    var onResume = function() {
        funf('status', 'resume');
        playMusic(MUSIC_URL);
    };
    // Set the name of the hidden property and the change event for visibility
    var hidden="hidden", visibilityChange="visibilitychange";
    if (typeof document.hidden !== "undefined") {
        hidden = "hidden";
        visibilityChange = "visibilitychange";
    } else if (typeof document.mozHidden !== "undefined") {
        hidden = "mozHidden";
        visibilityChange = "mozvisibilitychange";
    } else if (typeof document.msHidden !== "undefined") {
        hidden = "msHidden";
        visibilityChange = "msvisibilitychange";
    } else if (typeof document.webkitHidden !== "undefined") {
        hidden = "webkitHidden";
        visibilityChange = "webkitvisibilitychange";
    }
    var onVisibilityChange = function() {
        var wasHidden = true;
        return function(e) {
            var isHidden = document[hidden] || false;
            if (wasHidden === isHidden) { return; }
            wasHidden = isHidden;
            if (isHidden) { onPause(); } else { onResume(); }
        };
    }();
    document.addEventListener(visibilityChange, onVisibilityChange,
                              false);

    var refresh = (function() {
        var lastFrame = Date.now();
        return function() {
            var now = Date.now();
            var isBorn = false;
            var i, b;
            for (i=0; i<balloons.length; i++) {
                b = balloons[i];
                b.update(now-lastFrame);
                if (b.isGone()) {
                    if (!b.popped) { incorrectAnswer('escape.'+b.color); }
                    isBorn = true;
                    b.reset();
                    funf('born', b.color);
                }
                b.refresh();
            }
            lastFrame = now;
            Compat.requestAnimationFrame(refresh);
            if (isBorn) {
                /* XXX play sound? */
            }
        };
    })();

    function onDeviceReady() {
        // phonegap
        document.addEventListener('pause', onPause, false);
        document.addEventListener('resume', onResume, false);
        onVisibilityChange();

        refresh();
    }
    if (window.Cordova && window.device) {
        document.addEventListener("deviceready", onDeviceReady, false);
    } else {
        console.log('not on phonegap');
        onDeviceReady();
    }
});

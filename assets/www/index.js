define(['domReady!', './alea', './buzz', './compat', './hammer'], function(document, Alea, Buzz, Compat, Hammer) {
    var MUSIC_URL = 'sounds/barrios_gavota';
    var COLORS = [ 'black', 'lilac', 'orange', 'yellow' ]; // also 'white'
    var INITIAL_BALLOON_Y_SPEED = 100; // pixels per second
    var INITIAL_BALLOON_X_SPEED = 25;
    var NUM_BALLOONS = 2;
    var ENABLE_ACCEL = true;
    var random = Alea.Random();
    var gameElement = document.getElementById('game');
    var buttonsElement = document.getElementById('buttons');
    var balloonsElement = document.getElementById('balloons');
    var buttons, handleButtonPress;

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
    Button.prototype.highlight = function(e) {
        this.domElement.classList.add('hover');
        e.preventDefault();
    };
    Button.prototype.unhighlight = function(e) {
        this.domElement.classList.remove('hover');
        e.preventDefault();
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
        this.domElement.style.top = '0px';
        this.domElement.style.left = '0px';
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
        this.speedy = (0.9+0.2*random()) * INITIAL_BALLOON_Y_SPEED;
        this.speedx = (2*random()-1) * INITIAL_BALLOON_X_SPEED;
        this.popped = false;
    };
    Balloon.prototype.refresh = function() {
        // the 'translateZ' is actually very important here: it enables
        // GPU acceleration of this transform.
        var transform = 'translateX('+Math.round(this.x)+'px) translateY('+Math.round(this.y)+'px) translateZ(0)';
        this.domElement.style.WebkitTransform =
            this.domElement.style.MozTransform =
            this.domElement.style.transform = transform;
    };
    Balloon.prototype.update = function(dt /* milliseconds */) {
        if (this.popped) { return; /* don't move after it's popped */ }
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
        return (this.y < -this.domElement.offsetHeight) || this.popped;
    };
    Balloon.prototype.pop = function() {
        // XXX run popping animation & sound effect
        this.popped = true;
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
            console.log('reached end');
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
                        'sounds/burst3'];
    var WHIZ_SOUNDS = ['sounds/deflate1',
                       'sounds/deflate2'];
    var correctAnswer = function() {
        var isWhiz = (random() < (1/15)); // 1-in-15 chance of a whiz
        // play balloon burst sound
        playSoundClip(random.choice(isWhiz ? WHIZ_SOUNDS : BURST_SOUNDS));
        // base speed increases as you get more correct
        INITIAL_BALLOON_Y_SPEED *= 1.05;
        INITIAL_BALLOON_X_SPEED *= 1.05;
    };
    var incorrectAnswer = function() {
        balloons.forEach(function(b) { b.speedy *= 2; });
    };

    handleButtonPress = function(color) {
        // remove the highest balloon of that color
        var i, b, best=null;
        for (i=0; i<balloons.length; i++) {
            b = balloons[i];
            if (b.color === color && !b.isGone()) {
                if (best===null || b.y < best.y) {
                    best = b;
                }
            }
        }
        if (best===null) {
            incorrectAnswer();
        } else {
            best.pop();
            correctAnswer(color);
        }
    };

    var onPause = function() { stopMusic(); };
    var onResume = function() { playMusic(MUSIC_URL); };
    var onVisibilityChange = function() {
        var wasHidden = document.webkitHidden || false;
        return function(e) {
            var isHidden = document.webkitHidden || false;
            if (wasHidden === isHidden) { return; }
            wasHidden = isHidden;
            if (isHidden) { onPause(); } else { onResume(); }
        };
    }();
    document.addEventListener('webkitvisibilitychange', onVisibilityChange,
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
                    isBorn = true;
                    b.reset();
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
        playMusic(MUSIC_URL);
        // phonegap
        document.addEventListener('pause', onPause, false);
        document.addEventListener('result', onResume, false);

        refresh();
    }
    if (window.Cordova && window.device) {
        document.addEventListener("deviceready", onDeviceReady, false);
    } else {
        console.log('not on phonegap');
        onDeviceReady();
    }
});

define(['domReady!', './alea', './compat', './funf', 'nell!', 'score!', 'sound', './version'], function(document, Alea, Compat, Funf, nell, score, Sound, version) {
    var MUSIC_URL = 'sounds/barrios_gavota';
    var COLORS = [ 'black', 'lilac', 'orange', 'yellow' ]; // also 'white'
    var MIN_BALLOON_SPEED_Y =   50 / 1000; /* pixels per ms */
    var MAX_BALLOON_SPEED_Y = 1000 / 1000; /* pixels per ms */
    var X_SPEED_FRACTION = 0.25; // fraction of y speed

    var initialBalloonSpeedY = MIN_BALLOON_SPEED_Y; /* pixels per ms */

    var NUM_BALLOONS = 2;
    var ENABLE_ACCEL = true;
    var random = Alea.Random();
    var gameElement = document.getElementById('game');
    var buttonsElement = document.getElementById('buttons');
    var balloonsElement = document.getElementById('balloons');
    var funf = nell.funf = score.funf = new Funf('NellBalloons'+version);
    var buttons, handleButtonPress;
    var refresh, refreshID = null;
    var SPROUTS;

    var AWARDS = [['a1', 1/2+1/3],
                  ['a2', 1/4+1/6],
                  ['a3', 1/8+1/9],
                  ['a4', 1/16+1/12],
                  ['a5', 1/32+1/15],
                  ['a6', 1/64+1/18],
                  ['a7', 1/128+1/21],
                  ['a8', 1/256+1/24]];
    // XXX remove all but first two rewards for first week deployment
    AWARDS.forEach(function(a) { a[1] = 0; });
    AWARDS[0][1] = 0.9;
    AWARDS[0][2] = 0.1;
    // XXX end award hack

    var pickAward = function() {
        var i;
        for (i=0, sum=0; i<AWARDS.length; i++) {
            sum += AWARDS[i][1];
        }
        var v = random() * sum;
        for (i=0, sum=0; i<AWARDS.length; i++) {
            sum += AWARDS[i][1];
            if (v < sum) { return AWARDS[i][0]; }
        }
        // should never get here
        return AWARDS[AWARDS.length-1][0];
    };
    var loseAward = function() {
        var i;
        for (i=0; i<AWARDS.length; i++) {
            var sprout = SPROUTS[AWARDS[i][0]];
            if (sprout.size >= 0) {
                sprout.shrink();
                if (sprout.size < 0) {
                    var elem = document.querySelector('#awards .award.'+AWARDS[i][0]);
                    elem.classList.remove('show');
                }
                return;
            }
        }
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

    var ClickableElement = function(color) {
        this.init(color);
    };
    ClickableElement.prototype = Object.create(ColoredElement.prototype);
    ClickableElement.prototype.init = function(color) {
        ColoredElement.prototype.init.call(this, document.createElement('a'),
                                           color);
        this.domElement.href='#';
        ['mousedown', 'touchstart'].forEach(function(evname) {
            this.domElement.addEventListener(evname,this.highlight.bind(this));
        }.bind(this));
        ['mouseup','mouseout','touchcancel','touchend'].forEach(function(evname){
            this.domElement.addEventListener(evname, this.unhighlight.bind(this));
        }.bind(this));
    };
    ClickableElement.prototype.highlight = function(event) {
        this.domElement.classList.add('hover');
        event.preventDefault();
    };
    ClickableElement.prototype.unhighlight = function(event) {
        this.domElement.classList.remove('hover');
        event.preventDefault();
        if (event.type !== 'touchcancel' &&
            event.type !== 'mouseout') {
            this.handleClick();
        }
    };

    var Button = function(color) {
        this.init(color);
    };
    Button.prototype = Object.create(ClickableElement.prototype);
    Button.prototype.init = function(color) {
        ClickableElement.prototype.init.call(this, color);
        this.attach(buttonsElement);
    };
    Button.prototype.handleClick = function() {
        handleButtonPress(this.color);
    };

    var MenuStar = function(altitude) {
        this.init(altitude);
    };
    MenuStar.prototype = Object.create(ClickableElement.prototype);
    MenuStar.prototype.init = function(altitude) {
        ClickableElement.prototype.init.call(this, 'star');
        this.altitude = altitude;
    };
    MenuStar.prototype.handleClick = function() {
        console.log('Menu Star for '+this.altitude+' clicked'); // XXX
    };

    var Balloon = function(color) {
        color = color || random.choice(buttons).color;
        ColoredElement.prototype.init.call(this, document.createElement('div'),
                                           color);
        this.balloon = document.createElement('div');
        this.balloon.classList.add('balloon');
        this.payload = document.createElement('div');
        this.payload.classList.add('payload');
        this.domElement.appendChild(this.payload); /* payload in back */
        this.domElement.appendChild(this.balloon); /* balloon in front */
        this.attach(balloonsElement);
        // starting x, y, and speed
        // pick a random x position
        this.reset(this.color); // set random bits.
        this.refresh();
    };
    Balloon.prototype = Object.create(ColoredElement.prototype);
    Balloon.prototype.reset = function(color) {
        color = color || random.choice(buttons).color;
        if (color !== this.color) {
            ColoredElement.prototype.reset.call(this, color);
        }
        // just in case element sizes change
        this.height = this.domElement.offsetHeight;
        this.maxx = balloonsElement.offsetWidth - this.domElement.offsetWidth;
        // now reset properties
        this.x = Math.floor(random() * this.maxx);
        this.y = balloonsElement.offsetHeight;
        // speeds are in pixels / second.
        this.speedy = (0.9+0.2*random()) * initialBalloonSpeedY;
        this.speedx = (2*random()-1) * this.speedy * X_SPEED_FRACTION;
        this.born = false; this.bornTime = this.pauseTime = 0;
        this.bornTimeout = 0; // born immediately by default
        this.popped = this.popDone = false;
        this.domElement.classList.remove('popped');
        this.domElement.classList.remove('squirt');
        this.domElement.classList.remove('payload-dropped');
        this.award = null;
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
        if (!this.born) {
            // don't move until it's born
            this.bornTimeout -= dt;
            if (this.bornTimeout < 0) {
                this.born = true;
                this.bornTime = Date.now();
                this.pauseTime = 0;
            }
            return;
        }
        if (this.popped) {
            // don't move after it's popped.
            this.popTimeout -= dt;
            if (this.popTimeout < 0) {
                this.popDone = true;
                if (this.domElement.classList.contains('squirt')) {
                    random.choice(BURST_SOUNDS).play();
                }
                if (this.award) {
                    var elem = document.querySelector(
                        '#awards .award.'+this.award);
                    var sprout = SPROUTS[this.award];
                    if (sprout.size >= 0) {
                        // deal w/ race -- maybe we lost this one already!
                        elem.classList.add('show');
                    }
                    elem.style.WebkitTransform='';
                    var flex = document.querySelector('#awards .award.flex');
                    flex.style.display = 'none';
                }
            }
            return;
        }
        this.y -= dt * this.speedy;
        this.x += dt * this.speedx;
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
        return (this.y < -this.height) || this.popDone;
    };
    Balloon.prototype.pop = function() {
        this.popped = true;
        // chance of award
        var isAward = (random() < (1/6)); // 1-in-6 chance of an award
        // run popping animation & sound effect
        var isSquirt = (random() < (1/15)); // 1-in-15 chance of a squirt
        // play balloon burst sound
        var sounds = isAward ? AWARD_SOUNDS : isSquirt ? SQUIRT_SOUNDS :
            BURST_SOUNDS;
        random.choice(sounds).play();
        this.domElement.classList.add('payload-dropped');

        if (isAward) {
            this.domElement.classList.add('popped');
            this.popTimeout = 250;
            // move an award up here.
            this.award = pickAward();
            var elem= document.querySelector('#awards .award.'+this.award);
            var sprout = SPROUTS[this.award];
            // do we already have this award?
            if (sprout.size >= 0) {
                // force the flex badge to fill in.
                var flex = document.querySelector('#awards .award.flex');
                flex.style.top = elem.offsetTop+'px';
                flex.style.left = elem.offsetLeft+'px';
                flex.style.display = 'block';
                flex.className = 'award flex '+this.award;
                elem = flex;
                this.popTimeout = 750;
            }
            var offsetY = elem.offsetTop + elem.offsetParent.offsetTop;
            var offsetX = elem.offsetLeft + elem.offsetParent.offsetLeft;
            var x = Math.round(this.x - offsetX + 23 /* center on balloon */);
            var y = Math.round(this.y - offsetY + 20 /* center on balloon */);
            elem.style.WebkitTransform='translate3d('+x+'px,'+y+'px,0)';
            sprout.grow();
            saveScore();
        } else if (isSquirt) {
            this.domElement.classList.add('squirt');
            this.popTimeout = 2000; // ms
        } else {
            this.domElement.classList.add('popped');
            this.popTimeout = 250; // ms
        }
    };

    var SPROUT_SCALES = (function() {
        var scales = [
            [0.143, 0.078] // smallest  (34x69)
        ];
        var stepsTo = function(n, end) {
            var i, sx, sy;
            var start = scales[scales.length-1];
            for (i=1; i<=n; i++) {
                sx = (end[0] - start[0]) * i / n;
                sy = (end[1] - start[1]) * i / n;
                scales.push([start[0] + sx, start[1] + sy]);
            }
        };
        // fill out table
        stepsTo(1, [0.215, 0.118]); // small     (51x104)
        stepsTo(1, [0.287, 0.156]); // orig size (68x138)
        stepsTo(5, [0.857, 0.469]); // 3x size   (203x415) (~25px per step)
        stepsTo(16,[1.000, 1.000]); // large               (~25px per step)
        Object.freeze(scales);
        return scales;
    })();

    var Sprout = function(awardClass) {
        this.awardClass = awardClass;
        this.domElement = document.querySelector('#sprouts .award.'+awardClass);
        this.setSize(-1);
    };
    Sprout.prototype = {};
    Sprout.prototype.grow = function() { this.setSize(this.size+1); };
    Sprout.prototype.shrink = function() { this.setSize(this.size-1); };
    Sprout.prototype.setSize = function(nsize) {
        var transform, scale;
        nsize = Math.max(-1, Math.min(nsize, SPROUT_SCALES.length-1));
        nsize = Math.round(nsize); // must be an integer
        if (this.size === nsize) { return; /* no change */ }
        this.size = nsize;
        if (nsize < 0) {
            this.domElement.classList.remove('show');
            transform = '';
        } else {
            this.domElement.classList.add('show');
            scale = SPROUT_SCALES[nsize];
            transform = 'translate3d(0,0,0) scale('+scale[0]+','+scale[1]+')';
        }
        this.domElement.style.WebkitTransform =
            this.domElement.style.MozTransform =
            this.domElement.style.transform = transform;
    };
    SPROUTS = {};
    AWARDS.forEach(function(a) {
        SPROUTS[a[0]] = new Sprout(a[0]);
    });
    Object.freeze(SPROUTS);

    // load recent score
    var loadScore = function() {
        if (!(score.recent && score.recent.length === AWARDS.length)) {
            return;
        }
        AWARDS.forEach(function(a, i) {
            var sprout = SPROUTS[a[0]];
            sprout.setSize(score.recent[i]);
            if (sprout.size >= 0) {
                var elem = document.querySelector('#awards .award.'+a[0]);
                elem.classList.add('show');
            }
        });
    };
    var saveScore = function() {
        var nscore = AWARDS.map(function(a) {
            return SPROUTS[a[0]].size;
        });
        score.save(nscore);
    };
    loadScore();

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

    altitudeStars = [];
    var createStars = function() {
        ['ground', 'troposphere', 'stratosphere', 'mesosphere'].forEach(function(altitude) {
            var s = new MenuStar(altitude);
            s.attach(document.querySelector('#menu > .stars > .'+altitude));
            altitudeStars.push(s);
        });
    };
    createStars();


    var balloons = [];
    while (balloons.length < NUM_BALLOONS) {
        balloons.push(new Balloon());
        // xxx spread out y starting locations
    }

    // let accelerometer influence drift
    var accelID = null;
    var startAccelerometer = function() { return null; };
    var stopAccelerometer = function() { };
    var updateAcceleration = function(a) {
        if (a.y < -4) {
            balloons.forEach(function(b) { b.speedx -= 50; });
        } else if (a.y > 4) {
            balloons.forEach(function(b) { b.speedx += 50; });
        }
    };
    if (navigator.accelerometer) {
        startAccelerometer = function() {
            return navigator.accelerometer.watchAcceleration(updateAcceleration,
                                                             function() {},
                                                             { frequency: 80 });
        };
        stopAccelerometer = function(id) {
            navigator.accelerometer.clearWatch(id);
        };
    }

    var music;
    var playMusic = function(src) {
        if (!music) {
            music = new Sound.Track({ url: src, formats: ['ogg','mp3'] });
        }
        music.loop();
    };
    var stopMusic = function() {
        if (music) {
            music.unloop();
        }
    };

    var loadSounds = function(sounds) {
        return sounds.map(function(url) {
            return new Sound.Effect({url: url, instances: 2,
                                     formats: ['ogg','mp3'] });
        });
    };

    var BURST_SOUNDS = loadSounds(['sounds/burst1',
                                   'sounds/burst2',
                                   'sounds/burst3',
                                   'sounds/burst4',
                                   'sounds/burst5',
                                   'sounds/burst6',
                                   'sounds/burst7']);
    var SQUIRT_SOUNDS = loadSounds(['sounds/deflate1',
                                    'sounds/deflate2']);
    var WRONG_SOUNDS = loadSounds(['sounds/wrong1']);
    var ESCAPE_SOUNDS = loadSounds(['sounds/wrong2']);
    var AWARD_SOUNDS = loadSounds(['sounds/award']);

    // smoothing factor -- closer to 0 means more weight on present
    var CORRECT_SMOOTHING = 0.8;
    // number of correct answers as fraction of total (weighted average)
    var correctFraction = 0;
    // milliseconds per correct answer (weighted average)
    var correctTime = 10000;

    var adjustSpeeds = function(correctTime, correctFraction) {
        // try to adjust speed such that:
        // (a) correctFraction is about 80%
        // (b) the balloon travels 90% up the screen in 'correctTime' ms.
        var aspeed = Math.max(correctFraction/0.8, 0.8) * initialBalloonSpeedY;
        var bspeed = (balloonsElement.offsetHeight * 0.9) / correctTime;
        var avg = (aspeed + bspeed) / 2;
        // only allow it to speed up/slow down by factor of 1.2 each time
        var ADJ_FACTOR = 1.2;
        var minnew = Math.max(initialBalloonSpeedY / ADJ_FACTOR,
                              MIN_BALLOON_SPEED_Y);
        var maxnew = Math.min(initialBalloonSpeedY * ADJ_FACTOR,
                              MAX_BALLOON_SPEED_Y);
        initialBalloonSpeedY = Math.max(minnew, Math.min(maxnew, avg));
    };

    var correctAnswer = function(color, balloonTime) {
        funf.record('correct', color+':'+balloonTime);
        // maintain weighted averages
        correctTime = CORRECT_SMOOTHING * correctTime +
            (1-CORRECT_SMOOTHING) * balloonTime;
        correctFraction = CORRECT_SMOOTHING * correctFraction +
            (1-CORRECT_SMOOTHING);
        // adjust speeds based on new fractions
        adjustSpeeds(correctTime, correctFraction);
    };
    var incorrectAnswer = function(how, balloonTime) {
        funf.record('incorrect', how+':'+balloonTime);

        // maintain weighted averages
        // since this answer is incorrect, use the time only if it
        // is greater than the current correctTime estimate.
        var correctTimeCopy = correctTime;
        if (balloonTime > correctTime) {
            correctTimeCopy = CORRECT_SMOOTHING * correctTime +
                (1 - CORRECT_SMOOTHING) * balloonTime;
        }
        correctFraction = CORRECT_SMOOTHING * correctFraction;

        // adjust speeds based on new fractions
        adjustSpeeds(correctTimeCopy, correctFraction);
    };

    var wrongLockoutID = null;
    var doubleTapLockoutID = null, doubleTapColor;
    handleButtonPress = function(color) {
        // remove the highest balloon of that color
        var i, b, best=null;
        for (i=0; i<balloons.length; i++) {
            b = balloons[i];
            if (b.color === color && b.born && !(b.isGone() || b.popped)) {
                if (best===null || b.y < best.y) {
                    best = b;
                }
            }
        }
        if (best===null) {
            // prevent double taps from being registered as wrong answers
            if (doubleTapLockoutID !== null && color == doubleTapColor) {
                return; /* ignore */
            }
            // prevent too many wrong answers from being recorded close together
            if (wrongLockoutID !== null) { return; }
            // ok, process the wrong answer
            random.choice(WRONG_SOUNDS).play();
            incorrectAnswer('click.'+color, /* XXX use the escape time */
                            Math.round(balloonsElement.offsetHeight /
                                       initialBalloonSpeedY));
            // lose an award (sigh)
            loseAward(); saveScore();
            wrongLockoutID = window.setTimeout(function() {
                wrongLockoutID = null;
            }, 500); // 0.5s time out after wrong answer
        } else {
            best.pop();
            correctAnswer(color, (Date.now() - best.bornTime) - best.pauseTime);
            // try to prevent a double tap being registered as a wrong answer.
            doubleTapColor = color;
            if (doubleTapLockoutID) {
                window.clearTimeout(doubleTapLockoutID);
            }
            doubleTapLockoutID = window.setTimeout(function() {
                doubleTapLockoutID = null;
            }, 500); // 0.5s double-tap lockout
        }
    };

    var pauseTime = Date.now();
    var onPause = function() {
        pauseTime = Date.now();
        funf.record('status', 'pause');
        stopMusic();
        if (refreshID !== null) {
            Compat.cancelAnimationFrame(refreshID);
            refreshID = null;
        }
        if (accelID !== null) {
            stopAccelerometer();
            accelID = null;
        }
        saveScore();
        funf.archive();
        document.body.classList.add('paused');
    };
    var onResume = function() {
        var timePaused = pauseTime - Date.now();
        funf.record('status', 'resume');
        playMusic(MUSIC_URL);
        if (refreshID === null) {
            refreshID = Compat.requestAnimationFrame(refresh);
        }
        if (accelID === null && ENABLE_ACCEL) {
            accelID = startAccelerometer();
        }
        document.body.classList.remove('paused');
        balloons.forEach(function(b) {
            b.pauseTime += timePaused;
        });
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

    refresh = (function() {
        var lastFrame = Date.now();
        return function innerRefresh() {
            var now = Date.now();
            var isBorn = false, isEscape = false;
            var i, b;
            for (i=0; i<balloons.length; i++) {
                b = balloons[i];
                b.update(Math.min(now-lastFrame, 100));
                if (b.isGone()) {
                    if (!b.popped) {
                        isEscape = true;
                        incorrectAnswer('escape.'+b.color,
                                        (now - b.bornTime) - b.pauseTime);
                    }
                    isBorn = true;
                    b.reset();
                    funf.record('born', b.color);
                }
                b.refresh();
            }
            // play sounds down here so we only start one per frame.
            if (isEscape) {
                random.choice(ESCAPE_SOUNDS).play();
            }
            if (isBorn) {
                // XXX inflation sound here was very noisy =(
            }
            lastFrame = now;
            // keep playing
            refreshID = Compat.requestAnimationFrame(refresh);
        };
    })();

    var handleNellTouch = function(ev) {
        ev.preventDefault();
        nell.switchColor();
    };
    ['mousedown','touchstart'].forEach(function(evname) {
        var nellElems = document.querySelectorAll('.nells > div > div'), i;
        for (i=0; i<nellElems.length; i++) {
            nellElems[i].addEventListener(evname, handleNellTouch, false);
        }
    });

    function onDeviceReady() {
        // phonegap
        document.addEventListener('pause', onPause, false);
        document.addEventListener('resume', onResume, false);
        onVisibilityChange();
        funf.record('startColor', nell.color);
        // add top-level "anim" class unless we're on xoom/honeycomb
        var isHoneycomb = window.device &&
            (window.device.platform==='Android') &&
            (window.device.version==='3.2.1') &&
            (window.device.name==='tervigon');
        if (!isHoneycomb) { document.body.classList.add('anim'); }
    }
    if (window.cordovaDetect) {
        document.addEventListener("deviceready", onDeviceReady, false);
    } else {
        console.log('not on phonegap');
        onDeviceReady();
    }
});

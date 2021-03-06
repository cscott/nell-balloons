define(['domReady!', './alea', './compat', './funf', 'nell!', 'score!', 'sound', './version'], function(document, Alea, Compat, Funf, nell, score, Sound, version) {
    var DOCUMENT_TITLE = document.title = "Nell's Balloons";
    var MUSIC_URL = 'sounds/barrios_gavota';
    var COLORS = [ 'black', 'lilac', 'orange', 'yellow' ]; // also 'white'
    var MIN_BALLOON_SPEED_Y =   50 / 1000; /* pixels per ms */
    var MAX_BALLOON_SPEED_Y =  800 / 1000; /* pixels per ms */
    var X_SPEED_FRACTION = 0.25; // fraction of y speed
    var BALLOON_SEPARATION_MS = 1000;

    var initialBalloonSpeedY = MIN_BALLOON_SPEED_Y; /* pixels per ms */

    var NUM_BALLOONS = 2;
    var ENABLE_ACCEL = false;
    var DEBUG_AWARD_OFTEN = false;
    var HTML5_HISTORY = history.pushState && history.replaceState;
    var random = Alea.Random();
    var gameElement = document.getElementById('game');
    var buttonsElement = document.getElementById('buttons');
    var balloonsElement = document.getElementById('balloons');
    var funf = nell.funf = score.funf = new Funf('NellBalloons'+version);
    var buttons, handleButtonPress;
    var refresh;
    var SPROUTS;

    var ALTITUDES = ['ground', 'troposphere', 'stratosphere', 'mesosphere'];
    // make reverse mapping as well.
    ALTITUDES.forEach(function(a, i) { ALTITUDES[a] = i; });
    ALTITUDES.toNum = function(a) { return ALTITUDES[a]; };

    var AWARDS = [['a1', 1/2+1/2],
                  ['a2', 1/4+1/4],
                  ['a3', 1/8+1/6],
                  ['a4', 1/16+1/8],
                  ['a5', 1/32+1/10],
                  ['a6', 1/64+1/12]];

    var elForEach = function(elementList, func) {
        var i;
        for (i=0; i<elementList.length; i++) {
            func(elementList[i], i);
        }
    };

    var awardCounter = 0;
    var pickAward = function() {
        // every N awards, choose from only unwon awards
        awardCounter = (awardCounter+1) % 6;
        var i, sprout;
        for (i=0, sum=0; i<AWARDS.length; i++) {
            if (!awardCounter) {
                sprout = SPROUTS[AWARDS[i][0]];
                if (sprout.size >=0) { continue; }
            }
            sum += AWARDS[i][1];
        }
        var v = random() * sum;
        for (i=0, sum=0; i<AWARDS.length; i++) {
            if (!awardCounter) {
                sprout = SPROUTS[AWARDS[i][0]];
                if (sprout.size >=0) { continue; }
            }
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
    var checkForFinishedLevel = function() {
        for (i=0; i<AWARDS.length; i++) {
            var sprout = SPROUTS[AWARDS[i][0]];
            if (sprout.size < 0) {
                return; // level not done yet!
            }
        }
        // ok, level done!
        if (GameMode.currentMode !== GameMode.Playing) {
            return; /* we're already transitioning */
        }
        // record sprouts sizes
        var sproutsizes = AWARDS.map(function(a) {
            return SPROUTS[a[0]].size;
        });
        // tell funf about completion
        funf.record('mode', {
            name: 'playing',
            type: 'levelcomplete',
            stars: Ruler.stars,
            streak: Ruler.streak,
            smoothedHeight: Ruler.smoothedHeight,
            sprouts: sproutsizes,
            level: GameMode.Playing.currentLevel.num,
            altitude: ALTITUDES.toNum(GameMode.Playing.currentAltitude)
        });
        // unlock next level
        score.setCompleted(GameMode.Playing.currentLevel.levelClass,
                           GameMode.Playing.currentAltitude,
                           Ruler.stars);
        // play congratulatory sound!
        stopMusic();
        LEVEL_SOUNDS[0].play();
        //  award stars!
        GameMode.StarThrob.push();
    };

    var ColoredElement = function(element, color) {
        this.domElement = element;
        this.domElement.classList.add(color);
        this.color = color;
    };
    ColoredElement.prototype = {};
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
        ColoredElement.call(this, document.createElement('a'), color);
        this.domElement.href='#';
        // android sometimes delivers events like:
        // touchstart, <dom mutation> touchcancel, mousedown mouseup
        // that results in double taps, which is bad.  ignore all mouse*
        // events on android as a hacky workaround.
        var isAndroid = !!window.cordovaDetect;
        ['mousedown', 'touchstart'].forEach(function(evname) {
            if (isAndroid && evname[0]==='m') { return; }
            this.domElement.addEventListener(evname,this.highlight.bind(this), false);
        }.bind(this));
        ['mouseup','mouseout','touchcancel','touchend'].forEach(function(evname){
            if (isAndroid && evname[0]==='m') { return; }
            this.domElement.addEventListener(evname, this.unhighlight.bind(this), false);
        }.bind(this));
        this.domElement.addEventListener('click', function(event) {
            // suppress 'click' event, which would change the history.
            event.preventDefault();
        }, false);
        this.ignoreMouse = false;
    };
    ClickableElement.prototype = Object.create(ColoredElement.prototype);
    ClickableElement.prototype.highlight = function(event) {
        switch (event.type) {
        case 'touchstart': this.ignoreMouse = true; break;
        case 'mousedown': if (this.ignoreMouse) { return; } break;
        }
        this.domElement.classList.add('hover');
        event.preventDefault();
        if (this.fast && this.ignoreMouse) { this.handleClick(); }
    };
    ClickableElement.prototype.unhighlight = function(event) {
        switch (event.type) {
        case 'mouseup':
        case 'mouseout':
            if (this.ignoreMouse) { return; } break;
        }
        this.domElement.classList.remove('hover');
        event.preventDefault();
        if (event.type !== 'touchcancel' &&
            event.type !== 'mouseout' &&
            !(this.fast && this.ignoreMouse)) {
            this.handleClick();
        }
        this.ignoreMouse = false;
    };

    var Button = function(color) {
        ClickableElement.call(this, color);
        this.domElement.appendChild(document.createElement('span'));
        this.attach(buttonsElement);
        this.fast = true; // fast button response
    };
    Button.prototype = Object.create(ClickableElement.prototype);
    Button.prototype.handleClick = function() {
        if (GameMode.currentMode !== GameMode.Playing) { return; }
        handleButtonPress(this.color);
    };

    var MenuTag = function(altitude) {
        ClickableElement.call(this, 'tag');
        this.altitude = altitude;
    };
    MenuTag.prototype = Object.create(ClickableElement.prototype);
    MenuTag.prototype.handleClick = function() {
        this.altitudeClicked(this.altitude);
    };

    var BALLOON_VARIANTS = ['var1','var2','var3','var4'];
    var Balloon = function(color) {
        color = color || random.choice(buttons).color;
        ColoredElement.call(this, document.createElement('div'), color);
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
    Balloon.prototype.doBirth = function() {
        this.born = true;
        this.bornTime = Date.now();
        this.pauseTime = 0;

        // just in case element sizes change
        this.height = this.domElement.offsetHeight;
        this.maxx = balloonsElement.offsetWidth - this.domElement.offsetWidth;
        // now reset properties
        this.x = Math.floor(random() * this.maxx);
        this.y = balloonsElement.offsetHeight;
        this.fastY = this.y - this.height;
        // speeds are in pixels / second.
        this.speedy = (0.9+0.2*random()) * initialBalloonSpeedY;
        this.speedx = (2*random()-1) * this.speedy * X_SPEED_FRACTION;

        funf.record('born', this.color);
    };
    Balloon.prototype.reset = function(color) {
        // change color
        color = color || random.choice(buttons).color;
        if (color !== this.color) {
            ColoredElement.prototype.reset.call(this, color);
        }
        // swap variant
        BALLOON_VARIANTS.forEach(function(v) {
            this.domElement.classList.remove(v);
        }.bind(this));
        this.variant = random.choice(BALLOON_VARIANTS);
        this.domElement.classList.add(this.variant);
        // reset other properties.
        this.born = false; this.bornTime = this.pauseTime = 0;
        this.bornTimeout = 0; // born immediately by default
        this.popped = this.popDone = false;
        ['popped','squirt','payload-dropped'].forEach(function(c) {
            this.domElement.classList.remove(c);
        }.bind(this));
        this.award = null;
        // ensure that unborn balloon is invisible
        this.x = 0;
        this.y = balloonsElement.offsetHeight;
    };
    Balloon.prototype.refresh = function() {
        if (this.popped) { return; }
        var transform = Math.round(this.x)+'px,'+Math.round(this.y)+'px';
        // the '3d' is actually very important here: it enables
        // GPU acceleration of this transform on webkit
        this.domElement.style.WebkitTransform =
            'translate3d('+transform+',0)';
        this.domElement.style.MozTransform =
            this.domElement.style.transform =
            'translate('+transform;+')';
    };
    Balloon.prototype.update = function(dt /* milliseconds */) {
        if (!this.born) {
            // don't move until it's born
            this.bornTimeout -= dt;
            if (this.bornTimeout < 0) {
                this.doBirth();
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
                    elem.style.WebkitTransform =
                        elem.style.MozTransform =
                        elem.style.transform = '';
                    var flex = document.querySelector('#awards .award.flex');
                    flex.style.display = 'none';

                    checkForFinishedLevel();
                }
            }
            return;
        }
        // faster until we get past the grass at the bottom.
        if (this.y > this.fastY) {
            // amount of time taken to get above fastY pixels at
            // MAX_BALLOON_SPEED_Y;
            var fastT = (this.y - this.fastY) / MAX_BALLOON_SPEED_Y;
            if (fastT > dt) {
                this.y -= dt * MAX_BALLOON_SPEED_Y;
            } else {
                this.y = this.fastY - (dt-fastT) * this.speedy;
            }
        } else {
            this.y -= dt * this.speedy;
        }
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
        if (!this.born) { return false; }
        // returns true if balloon has floated past top of screen
        return (this.y < -this.height) || this.popDone;
    };
    Balloon.prototype.pop = function() {
        this.popped = true;
        // chance of award
        var isAward = (random() < (1/3.5)); // 1-in-4 chance of an award
        // XXX: switch to "every 4th balloon is an award?"
        if (DEBUG_AWARD_OFTEN) { isAward = true; } // award always, for testing
        // run popping animation & sound effect
        var isSquirt = (random() < (1/15)); // 1-in-15 chance of a squirt
        // play balloon burst sound
        var sounds = isAward ? AWARD_SOUNDS : isSquirt ? SQUIRT_SOUNDS :
            BURST_SOUNDS;
        random.choice(sounds).play();
        this.domElement.classList.add('payload-dropped');
        // play the appropriate learning reinforcement sound
        var level = GameMode.Playing.currentLevel;
        var altitude = GameMode.Playing.currentAltitude;
        var reinforcement = level.soundFor(altitude, this.color, this.variant);
        if (reinforcement.length) {
            random.choice(reinforcement).play();
        }

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
            var transform = x+'px,'+y+'px';
            elem.style.WebkitTransform=
                'translate3d('+transform+',0)';
            elem.style.MozTransform=
                elem.style.transform=
                'translate('+transform+')';
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

        // HALVE THE NUMBER OF STEPS (original was too fine grained)
        function decimateBy(n) {
            var i;
            for (i=0; n*i < scales.length; i++) {
                scales[i] = scales[n*i];
            }
            scales.length = i;
        }
        decimateBy(2);
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
        var transform, wktransform, scale;
        nsize = Math.max(-1, Math.min(nsize, SPROUT_SCALES.length-1));
        nsize = Math.round(nsize); // must be an integer
        if (this.size === nsize) { return; /* no change */ }
        this.size = nsize;
        if (nsize < 0) {
            this.domElement.classList.remove('show');
            transform = wktransform = '';
        } else {
            this.domElement.classList.add('show');
            scale = SPROUT_SCALES[nsize];
            transform = 'scale('+scale[0]+','+scale[1]+')';
            wktransform = 'translate3d(0,0,0) ' + transform;
        }
        this.domElement.style.WebkitTransform = wktransform;
        this.domElement.style.MozTransform =
            this.domElement.style.transform = transform;
        this.setTime();
    };
    Sprout.prototype.setTime = function(time, delay) {
        this.domElement.style.webkitTransitionDuration=
            this.domElement.style.mozTransitionDuration=
            this.domElement.style.transitionDuration=(time || '');
        this.domElement.style.webkitTransitionDelay=
            this.domElement.style.mozTransitionDelay=
            this.domElement.style.transitionDelay=(delay || '');
    };
    SPROUTS = {};
    AWARDS.forEach(function(a) {
        SPROUTS[a[0]] = new Sprout(a[0]);
    });
    Object.freeze(SPROUTS);

    // load recent score
    var loadScore = function() {
        if (!(score.recent && score.recent.length >= AWARDS.length)) {
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
    //loadScore();

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
    // multitouch hack
    var handleMultitouch = function(event) {
        var changedTouches = event.changedTouches, i, j;
        for (i=0; i<changedTouches.length; i++) {
            var touch = changedTouches[i];
            for (j=0; j<buttons.length; j++) {
                var button = buttons[j];
                if (touch.target === button.domElement ||
                    touch.target === button.domElement.firstChild) {
                    if (event.type==='touchstart') {
                        button.domElement.classList.add('hover');
                        button.handleClick();
                    } else {
                        button.domElement.classList.remove('hover');
                    }
                }
            }
        }
        event.stopPropagation();
        event.preventDefault();
        return false;
    };
    ['touchstart', 'touchend', 'touchcancel'].forEach(function(evname) {
        document.getElementById('buttons').addEventListener(evname,
                                                            handleMultitouch,
                                                            true);
    });

    altitudeStars = [];
    var createMenuTags = function() {
        ALTITUDES.forEach(function(altitude) {
            var s = new MenuTag(altitude);
            s.attach(document.querySelector('#menu .awards > .'+altitude));
            altitudeStars.push(s);
        });
    };
    createMenuTags();


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
        if (music && music.origSrc !== src) {
            stopMusic();
            music.release();
            music = null;
        }
        if (!music) {
            // bug with ogg on firefox/android:
            //  https://bugzilla.mozilla.org/show_bug.cgi?id=791017
            // use webm on all platforms for now, save some space.
            music = new Sound.Track({ url: src, formats: ['webm'/*,'ogg','mp3'*/] });
            music.origSrc = src;
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
            // bug with ogg on firefox/android:
            //  https://bugzilla.mozilla.org/show_bug.cgi?id=791017
            // use webm on all platforms for now, save some space.
            return new Sound.Effect({url: url, instances: 1,
                                     formats: ['webm'/*,'ogg','mp3'*/] });
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
    var LEVEL_SOUNDS = loadSounds(['sounds/levelwin'/*,
                                   'sounds/levellose'*/]);

    // utility method
    var _switchClass = function(elem, from, to, optProp) {
        var f = optProp ? (from && from[optProp]) : from;
        var t = optProp ? to[optProp] : to;
        if (f) { elem.classList.remove(f); }
        elem.classList.add(t);
        return to;
    };

    // ------------ game modes ---------------
    var GameMode = function(bodyClass) {
        this.bodyClass = bodyClass;
        this.active = false;
    };
    GameMode.prototype = {};
    GameMode.prototype.enter = function() {
        this.resume();
        document.body.classList.add(this.bodyClass);
        this.active = true;
    };
    GameMode.prototype.leave = function() {
        this.pause();
        document.body.classList.remove(this.bodyClass);
        this.active = false;
    };
    GameMode.prototype.pause = function() {
        document.body.classList.add('paused');
        funf.record('status', 'pause');
    };
    GameMode.prototype.resume = function() {
        document.body.classList.remove('paused');
        funf.record('status', 'resume');
    };
    GameMode.prototype.toJSON = function() {
        return { mode: this.bodyClass };
    };
    // static properties
    GameMode.currentMode = null;
    GameMode.switchTo = function(mode) {
        if (GameMode.currentMode) {
            GameMode.currentMode.leave();
        }
        GameMode.currentMode = mode;
        GameMode.currentMode.enter();
    };

    GameMode.Menu = new GameMode('menu');
    GameMode.Menu.toJSON = function() {
        return { mode: 'Menu', level: this.currentLevel.num };
    };
    GameMode.Menu.enter = (function(superEnter) {
        return function() {
            superEnter.call(this);
            funf.record('mode', { name: 'menu' });
            // sync the exposed altitudes from the current score object
            this.syncExposed();
        };
    })(GameMode.Menu.enter);
    GameMode.Menu.start = function(altitude) {
        // allow resuming the current level w/o reset
        if (GameMode.Playing.currentLevel !== this.currentLevel ||
            GameMode.Playing.currentAltitude !== altitude) {
            GameMode.Playing.switchLevel(this.currentLevel);
            GameMode.Playing.switchAltitude(altitude);
            GameMode.Playing.reset();
        }
        if (HTML5_HISTORY) { // update current menu level
            history.replaceState(GameMode.currentMode.toJSON(),
                                 DOCUMENT_TITLE+' | Menu', '#menu');
        }
        GameMode.switchTo(GameMode.Playing);
        if (HTML5_HISTORY) { // Android/Honeycomb doesn't support this
            history.pushState(GameMode.currentMode.toJSON(),
                              DOCUMENT_TITLE + ' | Play!',
                              '#play');
        }
        funf.record('mode', {
            name: 'playing',
            type: 'levelstart',
            level: GameMode.Playing.currentLevel.num,
            altitude: ALTITUDES.toNum(GameMode.Playing.currentAltitude)
        });
    };
    GameMode.Menu.switchLevel = function(level) {
        var levelElem = document.querySelector('#menu .level');
        this.currentLevel = _switchClass(levelElem, this.currentLevel, level,
                                         'levelClass');
        var dot = document.querySelector('#menu .levelnav .dot.on');
        if (dot) { dot.classList.remove('on'); }
        level.dot.classList.add('on');

        var prev = document.querySelector('#menu .levelnav .prev');
        prev.classList.remove('hidden');
        if (!level.prevLevel) { prev.classList.add('hidden'); }

        var next = document.querySelector('#menu .levelnav .next');
        next.classList.remove('hidden');
        if (!level.nextLevel) { next.classList.add('hidden'); }
        // sync the exposed altitudes from the current score object
        this.syncExposed();
    };
    GameMode.Menu.syncExposed = function() {
        this.setExposed('none', 0);
        if (this.currentLevel.prevLevel &&
            !score.isCompleted(this.currentLevel.prevLevel.levelClass,
                               ALTITUDES[ALTITUDES.length-1])) {
            // this level isn't unlocked yet. hide everything.
            return;
        }
        for (i=0; i < ALTITUDES.length; i++) {
            var numStars =
                score.numStars(this.currentLevel.levelClass, ALTITUDES[i]);
            this.setExposed(ALTITUDES[i], numStars);
            if (!score.isCompleted(this.currentLevel.levelClass, ALTITUDES[i])){
                break;
            }
        }
    };
    GameMode.Menu.setExposed = function(altitude, stars) {
        var shadeElem = document.querySelector('#menu .level');
        var old = this.currentExposed && ('exposed-'+this.currentExposed);
        _switchClass(shadeElem, old, 'exposed-'+altitude);
        this.currentExposed = altitude;
        if (altitude === 'none') { return; }
        // set the # of stars
        var starsElem = document.querySelector('#menu .awards > .'+altitude+' > .stars');
        ['zero','one','two','three'].forEach(function(name, num) {
            if (stars===num) {
                starsElem.classList.add(name);
            } else {
                starsElem.classList.remove(name);
            }
        });
    };
    GameMode.Menu.prevClicked = function() {
        if (!this.currentLevel.prevLevel) { return; }
        this.switchLevel(this.currentLevel.prevLevel);
    };
    GameMode.Menu.nextClicked = function() {
        if (!this.currentLevel.nextLevel) { return; }
        this.switchLevel(this.currentLevel.nextLevel);
    };
    ['prev', 'next'].forEach(function(arrow) {
        var e = new ClickableElement(arrow);
        e.attach(document.querySelector('#menu .levelnav .inner'));
        e.handleClick = GameMode.Menu[arrow+'Clicked'].bind(GameMode.Menu);
        GameMode.Menu[arrow+'Arrow'] = e;
    });
    MenuTag.prototype.altitudeClicked =
        GameMode.Menu.start.bind(GameMode.Menu);

    GameMode.OverlayMode = function(bodyClass) {
        GameMode.call(this, bodyClass);
        this.underMode = null;
    };
    GameMode.OverlayMode.prototype = Object.create(GameMode.prototype);
    GameMode.OverlayMode.prototype.setUnderMode = function(underMode) {
        this.underMode = this.active ?
            _switchClass(document.body, this.underMode, underMode, 'bodyClass'):
            underMode;
    };
    GameMode.OverlayMode.prototype.push = function() {
        this.lastMode = GameMode.currentMode;
        this.setUnderMode(GameMode.currentMode.underMode ||
                          GameMode.currentMode);
        GameMode.switchTo(this);
    };
    GameMode.OverlayMode.prototype.pop = function() {
        console.assert(GameMode.currentMode === this);
        GameMode.switchTo(this.lastMode);
    };
    GameMode.OverlayMode.prototype.enter = (function(superEnter) {
        return function() {
            superEnter.call(this);
            if (this.underMode)
                document.body.classList.add(this.underMode.bodyClass);
        };
    })(GameMode.OverlayMode.prototype.enter);
    GameMode.OverlayMode.prototype.leave = (function(superLeave) {
        return function() {
            superLeave.call(this);
            if (this.underMode)
                document.body.classList.remove(this.underMode.bodyClass);
        };
    })(GameMode.OverlayMode.prototype.leave);

    GameMode.TransitionOverlayMode = function(bodyClass, delayMs) {
        GameMode.OverlayMode.call(this, bodyClass);
        this.delayMs = delayMs;
        this.switchId = null;
    };
    GameMode.TransitionOverlayMode.prototype =
        Object.create(GameMode.OverlayMode.prototype);
    GameMode.TransitionOverlayMode.prototype.nextMode = function() { };
    GameMode.TransitionOverlayMode.prototype.enter = (function(superEnter) {
        return function() {
            superEnter.call(this);
            // in 5s, move to the next overlay
            var isAndroid = window.device &&
                (window.device.platform==='Android');

            var dt = this.delayMs;
            this.switchTime = Date.now() + dt;
            this.switchId = setTimeout(this.switchMode.bind(this),
                                       /* android's setTimeout takes its sweet
                                        * time, so hack around it */
                                       isAndroid && dt ? 250 : dt);
        };
    })(GameMode.TransitionOverlayMode.prototype.enter);
    GameMode.TransitionOverlayMode.prototype.leave = (function(superLeave) {
        return function() {
            superLeave.call(this);
            if (this.switchId === null) { return; }
            clearTimeout(this.switchId);
            this.switchId = null;
        };
    })(GameMode.TransitionOverlayMode.prototype.leave);
    GameMode.TransitionOverlayMode.prototype.switchMode = function() {
        // handle late-or-premature invocation on Android (sigh)
        if (Date.now () < this.switchTime) {
            this.switchId = setTimeout(this.switchMode.bind(this), 10);
            return;
        }
        this.switchId = null;
        // give subclass a chance to transition
        if (!this.nextMode()) { this.pop(); }
    };

    GameMode.StarThrob = new GameMode.TransitionOverlayMode('starthrob', 5000);
    GameMode.StarThrob.enter = (function(superEnter) {
        return function() {
            // tweak the timing if there are no stars to flash
            this.delayMs = (Ruler.stars===0) ? 0 : 5000;
            superEnter.call(this);
        };
    })(GameMode.StarThrob.enter);
    GameMode.StarThrob.nextMode = function() {
        // android massacres this animation, sigh.
        var isAndroid = !!window.cordovaDetect;
        // grow sprouts up to next level
        AWARDS.forEach(function(a) {
            var sprout = SPROUTS[a[0]];
            if (sprout.size >= 0) {
                if (!isAndroid) {
                    sprout.setSize(SPROUT_SCALES.length);
                    sprout.setTime('3s');
                } else {
                    sprout.setSize(-1);
                }
            }
        });
        if (isAndroid) { GameMode.SproutsGrow.delayMs = 0; }
        GameMode.SproutsGrow.push(); // delay while sprouts grow
        return true; // did my own transition
    };

    GameMode.SproutsGrow = new GameMode.TransitionOverlayMode('sproutsgrow',
                                                              3000);
    GameMode.SproutsGrow.nextMode = function() {
        GameMode.Video.push();
        return true;
    };

    GameMode.Video = new GameMode.OverlayMode('video');
    GameMode.Video.enter = (function(superEnter) {
        return function() {
            superEnter.call(this);
            this.maybeUnloadVideo();
            // load the appropriate video and wait until ready to play
            var level = GameMode.Playing.currentLevel;
            var altitude = GameMode.Playing.currentAltitude;
            var inner = document.querySelector('#video > .inner');
            this.videoElement = document.createElement('video');
            this.videoStartTime = this.videoEndTime = null;
            this.lastSeek = this.playbackPercent = null;
            this.videoPaused = false;
            if (false) {
                /* these break appcache on firefox! */
                // https://bugzilla.mozilla.org/show_bug.cgi?id=741351
                this.videoElement.autobuffer = true;
                this.videoElement.preload = 'auto';
            } else {
                // needed on desktop firefox (!)
                this.videoElement.preload = 'none';
            }
            this.videoElement.volume = 1;
            this.videoElement.muted = false; // xxx?
            this.videoElement.poster = level.videoFor(altitude, 'jpg');
            this.videoElement.addEventListener('canplay',
                                               this.canPlay.bind(this), false);
            this.videoElement.addEventListener('loadstart',/* for firefox =( */
                                               this.canPlay.bind(this), false);
            this.videoElement.addEventListener('ended',
                                               this.playEnded.bind(this),false);
            // XXX something's wrong with mp4 rendering on webkit.
            // ... also on firefox:
            //    https://bugzilla.mozilla.org/show_bug.cgi?id=790950
            [/*'mp4',*/ 'webm'].forEach(function(videotype) {
                var source = document.createElement('source');
                source.type = 'video/' + videotype;
                source.src = level.videoFor(altitude, videotype);
                this.videoElement.appendChild(source);
            }.bind(this));
            inner.insertBefore(this.videoElement, inner.firstChild);
            this.videoElement.load();
        };
    })(GameMode.Video.enter);
    GameMode.Video.pause = (function(superPause) {
        return function() {
            superPause.call(this);
            // pause video (if playing)
            this.videoPaused = true;
            if (this.videoStartTime !== null && this.videoEndTime === null) {
                this.videoElement.pause();
            }
        };
    })(GameMode.Video.pause);
    GameMode.Video.resume = (function(superResume) {
        return function() {
            superResume.call(this);
            // resume video (if loaded)
            this.videoPaused = false;
            if (this.videoStartTime !== null && this.videoEndTime === null) {
                this.videoElement.play();
            }
        };
    })(GameMode.Video.pause);
    GameMode.Video.canPlay = function() {
        // ready to play, let's do it!
        document.querySelector('#video').classList.add('playing');
        this.videoStartTime = Date.now();
        if (!this.videoPaused) {
            this.videoElement.play();
        }
    };
    GameMode.Video.playEnded = function() {
        var video = document.querySelector('#video');
        if (video.classList.contains('playing')) {
            this.videoEndTime = Date.now();
            video.classList.remove('playing');
        }
    };
    GameMode.Video.maybeUnloadVideo = function() {
        if (this.videoElement) {
            // collect some playback metrics
            this.lastSeek = this.videoElement.currentTime;
            this.playbackPercent = 100 * this.lastSeek /
                this.videoElement.duration;
            // XXX could iterate through this.videoElement.played as well.
            this.videoElement.parentElement.removeChild(this.videoElement);
            this.videoElement = null;
        }
        this.playEnded(); // remove 'playing' attribute, record end time.
    };
    GameMode.Video.leave = (function(superLeave) {
        return function() {
            this.maybeUnloadVideo();
            // record video playback duration for funf.
            funf.record('videoplayback', {
                duration: (this.videoStartTime && this.videoEndTime) ?
                    (this.videoEndTime - this.videoStartTime) : null,
                seek: this.lastSeek, /* another measure of playback time */
                completion: this.playbackPercent,
                level: GameMode.Playing.currentLevel.num,
                altitude: ALTITUDES.toNum(GameMode.Playing.currentAltitude)
            });
            superLeave.call(this);
        };
    })(GameMode.Video.leave);
    GameMode.Video.arrow = new ClickableElement('arrow');
    GameMode.Video.arrow.attach(document.querySelector('#video > .inner'));
    GameMode.Video.arrow.handleClick = function() {
        GameMode.LevelDone.push();
    };

    GameMode.LevelDone = new GameMode.TransitionOverlayMode('leveldone', 0);
    GameMode.LevelDone.nextMode = function() {
        if (GameMode.Playing.nextAltitude()) {
            GameMode.Playing.reset();
            AWARDS.forEach(function(a) {
                var sprout = SPROUTS[a[0]];
                sprout.setTime('0s', '1s');
            });
            // reset sound to match new level
            GameMode.switchTo(GameMode.Playing);
            return true;
        } else if (HTML5_HISTORY) {
            this.currentLevel = GameMode.Playing.currentLevel;
            history.back();
            return true; // ???
        } else {
            GameMode.Menu.switchLevel(GameMode.Playing.currentLevel);
            GameMode.switchTo(GameMode.Menu);
            return true;
        }
    };

    GameMode.Rotate = new GameMode.OverlayMode('rotate');

    GameMode.Install = new GameMode.OverlayMode('install');
    document.querySelector('#install .yes').addEventListener('click',function(){
        GameMode.Install.maybeInstall(true);
    }, false);
    document.querySelector('#install .no').addEventListener('click',function(){
        GameMode.Install.maybeInstall(false);
    }, false);
    GameMode.Install.maybeInstall = function(doInstall) {
        var cb = function() { GameMode.Install.pop(); };
        if (doInstall) {
            GameMode.Install.doInstall(cb);
        } else {
            cb();
        }
    };

    GameMode.Playing = new GameMode('game');
    GameMode.Playing.toJSON = function() {
        return {
            mode: 'Playing',
            level: this.currentLevel.num,
            altitude: this.currentAltitude
        };
    };
    GameMode.Playing.reset = function() {
        initialBalloonSpeedY = MIN_BALLOON_SPEED_Y;
        balloons.forEach(function(b, i) {
            b.reset();
            b.bornTimeout = 1000 + (i*BALLOON_SEPARATION_MS);
            // race here with sizing of balloonselement, sigh.
            // i hope balloons are never more than a thousand pixels big
            b.x = balloonsElement.offsetWidth || -1000;
            b.y = balloonsElement.offsetHeight || -1000;
            b.refresh();
        });
        AWARDS.forEach(function(a) {
            var sprout = SPROUTS[a[0]];
            sprout.setSize(-1);
            sprout.setTime('0s');
        });
        elForEach(document.querySelectorAll('#awards .award'), function(a) {
            a.classList.remove('show');
            a.style.WebkitTransform =
                a.style.MozTransform =
                a.style.transform = '';
        });
        var flex = document.querySelector('#awards .award.flex');
        flex.style.display = 'none';

        Ruler.reset();
    };
    GameMode.Playing.switchLevel = function(level) {
        var levelElem = document.querySelector('#gamelevel.level');
        if (this.currentLevel) { this.currentLevel.unloadSounds(); }
        this.currentLevel = _switchClass(levelElem, this.currentLevel, level,
                                         'levelClass');
        this.currentLevel.loadSounds();
        // XXX re-randomize the button order?
    };
    GameMode.Playing.switchAltitude = function(altitude) {
        var levelElem = document.querySelector('#gamelevel.level');
        this.currentAltitude = _switchClass(levelElem,
                                            this.currentAltitude, altitude);
    };
    GameMode.Playing.nextAltitude = function() {
        var a = (ALTITUDES.toNum(this.currentAltitude) + 1) % ALTITUDES.length;
        if (a === 0) {
            var l = this.currentLevel.nextLevel;
            if (l===null) {
                return false; // no more levels.
            }
            this.switchLevel(l);
        }
        this.switchAltitude(ALTITUDES[a]);
        return true;
    };
    GameMode.Playing.pause = (function(superPause) {
        return function() {
            superPause.call(this);
            this.pauseTime = Date.now();
            stopMusic();
            if (refresh.id !== null) {
                Compat.cancelAnimationFrame(refresh.id);
                refresh.id = null;
            }
            if (accelID !== null) {
                stopAccelerometer();
                accelID = null;
            }
            saveScore();
            funf.archive();
        };
    })(GameMode.Playing.pause);
    GameMode.Playing.resume = (function(superResume) {
        return function() {
            superResume.call(this);
            var timePaused = this.pauseTime - Date.now();
            playMusic(this.currentLevel.audioUrl());
            refresh.lastFrame = Date.now();
            if (refresh.id === null) {
                refresh.id = Compat.requestAnimationFrame(refresh);
            }
            if (accelID === null && ENABLE_ACCEL) {
                accelID = startAccelerometer();
            }
            balloons.forEach(function(b) {
                b.pauseTime += timePaused;
            });
        };
    })(GameMode.Playing.resume);
    GameMode.Playing.pauseTime = Date.now();

    // loading reinforcement sounds ---------
    var loadSoundTags = function(soundTags) {
        var soundbank = {};
        var load = function(filename) {
            var key = '$' + filename;
            if (!soundbank.hasOwnProperty(key)) {
                soundbank[key] = new Sound.Effect({ url: 'sounds/'+filename,
                                                    instances: 1,
                                                    formats: ['webm'] });
            }
            return soundbank[key];
        };
        var unload = function() {
            for (var key in soundbank) {
                if (soundbank.hasOwnProperty(key)) {
                    soundbank[key].release();
                    delete soundbank[key];
                }
            }
        };
        var st = {};
        ALTITUDES.forEach(function(a) {
            st[a] = {};
            COLORS.forEach(function(c) {
                st[a][c] = {};
                BALLOON_VARIANTS.forEach(function(v) {
                    var tags = soundTags[a][c] || [];
                    // handle shorthand, if all variants aren't spec'ed
                    if (tags[v]) { tags = tags[v]; }
                    // handle shorthand: string instead of length-1 array
                    if (typeof(tags)==='string') { tags = [ tags ]; }
                    // HACK: chrome crashes if we load too many sounds!
                    //       turn off feedback sounds.
                    if (/ Chrome\//.test(window.navigator.userAgent)) {
                        st[a][c][v] = [];
                    } else {
                        st[a][c][v] = tags.map(load);
                    }
                });
            });
        });
        st.unload = unload;
        return st;
    };

    // ------------ game levels --------------
    var GameLevel = function(levelClass, musicBase, soundTags) {
        this.levelClass = levelClass;
        this.musicBase = musicBase;
        this.soundTags = soundTags;
        this.sounds = null;
    };
    GameLevel.prototype = {};
    GameLevel.prototype.audioUrl = function() {
        return "sounds/"+this.musicBase;
    };
    GameLevel.prototype.videoFor = function(altitude, format) {
        var url = "video/SpaceBalloon"+(1+this.num)+"-"+(1+ALTITUDES.toNum(altitude));
        if (format==='mp4') {
            return url + "-baseline.mp4";
        } else if (format==='jpg') {
            return url + '.jpg';
        } else {
            return url + "-256k32k.webm";
        }
    };
    GameLevel.prototype.loadSounds = function() {
        this.sounds = loadSoundTags(this.soundTags);
    };
    GameLevel.prototype.unloadSounds = function() {
        if (this.sounds) { this.sounds.unload(); }
        this.sounds = null;
    };
    GameLevel.prototype.soundFor = function(altitude, color, variant) {
        console.assert(this.sounds);
        return this.sounds[altitude][color][variant];
    };

    var BAT_MAT_CAT_CAB = {
        black: ['angela_bat', 'richard_bat', 'scott_bat', 'scott_b_a_t'],
        lilac: ['angela_mat', 'richard_mat', 'scott_mat', 'scott_m_a_t'],
        orange:['angela_cat', 'richard_cat', 'scott_cat', 'scott_c_a_t'],
        yellow:['angela_cab', 'richard_cab', 'scott_cab', 'scott_c_a_b']
    };
    var LEVELS = [
        // "grass" level
        new GameLevel('level1', 'barrios-gavota', {
            // no sounds for first level
            ground: {},
            troposphere: {},
            stratosphere: {},
            mesosphere: {}
        }),
        // "mountains" level
        new GameLevel('level2', 'letting-go', {
            ground:
            { black: ['angela_name_b', 'richard_name_b' ],
              lilac: ['angela_name_m', 'richard_name_m' ],
              orange:['angela_name_t', 'richard_name_t' ],
              yellow:['angela_name_c', 'richard_name_c' ]
            },
            troposphere:
            { black: ['angela_sound_b', 'richard_sound_b'],
              lilac: ['angela_sound_m', 'richard_sound_m'],
              orange:['angela_sound_t', 'richard_sound_t'],
              yellow:['angela_sound_c', 'richard_sound_c']
            },
            stratosphere: BAT_MAT_CAT_CAB,
            mesosphere:   BAT_MAT_CAT_CAB
        }),
        // "sand" level
        new GameLevel('level3', 'red-wing', {
            ground:       BAT_MAT_CAT_CAB,
            troposphere:  BAT_MAT_CAT_CAB,
            stratosphere: BAT_MAT_CAT_CAB,
            mesosphere:   BAT_MAT_CAT_CAB
        }),
        // "snow" level
        new GameLevel('level4', 'arkansas-traveller', {
            ground:
            { black: { var1: 'scott_bat',     var2: 'scott_a_bat',
                       var3: 'scott_the_bat', var4: 'scott_bats' },
              lilac: { var1: 'scott_mat',     var2: 'scott_a_mat',
                       var3: 'scott_the_mat', var4: 'scott_mats' },
              orange:{ var1: 'scott_cat',     var2: 'scott_a_cat',
                       var3: 'scott_the_cat', var4: 'scott_cats' },
              yellow:{ var1: 'scott_cab',     var2: 'scott_a_cab',
                       var3: 'scott_the_cab', var4: 'scott_cabs' } },
            troposphere:
            { black: { var1: 'scott_bat',     var2: 'scott_a_bat',
                       var3: 'scott_the_bat', var4: 'scott_bats' },
              lilac: { var1: 'scott_mat',     var2: 'scott_a_mat',
                       var3: 'scott_the_mat', var4: 'scott_mats' },
              orange:{ var1: 'scott_cat',     var2: 'scott_a_cat',
                       var3: 'scott_the_cat', var4: 'scott_cats' },
              yellow:{ var1: 'scott_cab',     var2: 'scott_a_cab',
                       var3: 'scott_the_cab', var4: 'scott_cabs' } },
            stratosphere:
            { black: 'scott_bat', lilac: 'scott_bats',
              orange: 'scott_cat', yellow: 'scott_cats' },
            mesosphere:
            { black: 'scott_mat', lilac: 'scott_mats',
              orange: 'scott_cab', yellow: 'scott_cabs' }
        })
    ];
    LEVELS.forEach(function(l, i) {
        l.num = i;
        l.prevLevel = LEVELS[i-1] || null;
        l.nextLevel = LEVELS[i+1] || null;
        l.dot = document.createElement('div');
        l.dot.classList.add('dot');
        document.querySelector('#menu .levelnav .inner').appendChild(l.dot);
    });


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
        // only use (b) if we have a valid correctTime estimate.
        var aspeed = Math.max(correctFraction/0.8, 0.8) * initialBalloonSpeedY;
        var bspeed = (correctTime===null) ? aspeed :
            (balloonsElement.offsetHeight * 0.9) / correctTime;
        var avg = (aspeed + bspeed) / 2;
        // only allow it to speed up/slow down by factor of 1.2 each time
        var ADJ_FACTOR = 1.2;
        var minnew = Math.max(initialBalloonSpeedY / ADJ_FACTOR,
                              MIN_BALLOON_SPEED_Y);
        var maxnew = Math.min(initialBalloonSpeedY * ADJ_FACTOR,
                              MAX_BALLOON_SPEED_Y);
        initialBalloonSpeedY = Math.max(minnew, Math.min(maxnew, avg));
    };

    var Ruler = {
        SMOOTHING: 0.85,
        domElement: document.querySelector('#ruler .foreground'),
        reset: function() {
            this.smoothedHeight = 1;
            this.height = 1;
            this.stars = 0;
            this.streak = 0;
            elForEach(document.querySelectorAll('#ruler .stars'), function(s) {
                s.classList.remove('highlight');
            });
            this.domElement.style.height = '100%';
        },
        adjust: function(isCorrect, height /* 0-1 fraction */) {
            var altitude = GameMode.Playing.currentAltitude;
            var e;
            // correct answer bonus
            if (isCorrect) {
                height -= 0.1;
                this.streak++;
            } else {
                this.streak = 0;
                height = 1;
            }
            // reflect current % on the ruler element
            this.smoothedHeight =
                Math.max(0, Math.min(1, Ruler.SMOOTHING * this.smoothedHeight +
                                     (1 - Ruler.SMOOTHING) * height));
            this.height = this.smoothedHeight *
                Math.max(0.28, Math.pow(0.98, this.streak));

            var pct = 25 * (this.height + ALTITUDES.toNum(altitude));
            this.domElement.style.height = pct+'%';
            // light up one, two, or three stars
            var nStars = (this.height < 0.28) ? 3 :
                (this.height < 0.54) ? 2 :
                (this.height < 0.79) ? 1 : 0;

            var efors = function(s) {
                return document.querySelector('#ruler .'+altitude+' .stars.' +
                                              ['zero','one','two','three'][s]);
            };
            if (nStars !== this.stars) {
                e = efors(this.stars);
                if (e) { e.classList.remove('highlight'); }
                this.stars = nStars;
                e = efors(this.stars);
                if (e) { e.classList.add('highlight'); }
            }
        }
    };
    Ruler.reset();

    var correctAnswer = function(color, balloonTime, balloonHeight) {
        funf.record('correct', { color: color, time: balloonTime });
        // maintain weighted averages
        correctTime = CORRECT_SMOOTHING * correctTime +
            (1-CORRECT_SMOOTHING) * balloonTime;
        correctFraction = CORRECT_SMOOTHING * correctFraction +
            (1-CORRECT_SMOOTHING);
        // adjust speeds based on new fractions
        adjustSpeeds(correctTime, correctFraction);
        Ruler.adjust(true, balloonHeight);
    };
    var incorrectAnswer = function(how, balloonTime) {
        funf.record('incorrect', { type: how, time: balloonTime });

        // maintain weighted averages
        // since this answer is incorrect, we don't actually have a
        // new correct time estimate (so don't try to use it)
        correctFraction = CORRECT_SMOOTHING * correctFraction;

        // adjust speeds based on new fractions
        adjustSpeeds(null/*don't use correctTime*/, correctFraction);
        Ruler.adjust(false, 1);
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
            correctAnswer(color, (Date.now() - best.bornTime) - best.pauseTime,
                          1-Math.max(0, best.y / balloonsElement.offsetHeight));
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

    var onPause = function() { GameMode.currentMode.pause(); };
    var onResume = function() { GameMode.currentMode.resume(); };
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

    refresh = function() {
        refresh.id = null;
        var now = Date.now();
        var isBorn = false, isEscape = false;
        var i, b;
        var dt = Math.max(0, Math.min(now - refresh.lastFrame, 100));
        for (i=0; i<balloons.length; i++) {
            b = balloons[i];
            b.update(dt);
            if (b.isGone()) {
                if (!b.popped) {
                    isEscape = true;
                    incorrectAnswer('escape.'+b.color,
                                    (now - b.bornTime) - b.pauseTime);
                }
                isBorn = true;
                b.reset();
                // enforce separation between balloons
                if ((now - refresh.lastBorn) < BALLOON_SEPARATION_MS) {
                    b.bornTimeout = BALLOON_SEPARATION_MS -
                        (now - refresh.lastBorn);
                    refresh.lastBorn += BALLOON_SEPARATION_MS;
                } else {
                    refresh.lastBorn = now;
                }
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
        refresh.lastFrame = now;
        // keep playing (if we haven't changed modes)
        if (GameMode.currentMode===GameMode.Playing) {
            refresh.id = Compat.requestAnimationFrame(refresh);
        }
    };
    refresh.id = null;
    refresh.lastFrame = Date.now();
    refresh.lastBorn = 0;

    var handleNellTouch = function(ev) {
        if (ev.type === 'touchstart') {
            // prevent duplicate events
            ev.target.removeEventListener('mousedown', handleNellTouch, false);
        }
        ev.preventDefault();
        nell.switchColor();
    };
    ['mousedown','touchstart'].forEach(function(evname) {
        // hacky workaround for android: removeEventListener('mousedown')
        // doesn't work on android (sigh) so don't register it to begin with
        var isAndroid = !!window.cordovaDetect;
        if (isAndroid && evname[0]==='m') { return; }

        elForEach(document.querySelectorAll('.nells > div > div'),
                  function(nellElem) {
                      nellElem.addEventListener(evname, handleNellTouch, false);
                  });
    });

    var onPopState = function(event) {
        var State = event.state;
        if (!State) { return; }
        if (!State.mode) { return; }
        switch (State.mode) {
        case 'Playing':
            GameMode.Playing.switchLevel(LEVELS[State.level]);
            GameMode.Playing.switchAltitude(LEVELS[State.altitude]);
            GameMode.switchTo(GameMode.Playing);
            break;
        case 'Menu':
            if (GameMode.currentMode.currentLevel) {
                GameMode.Menu.switchLevel(GameMode.currentMode.currentLevel);
            } else {
                GameMode.Menu.switchLevel(LEVELS[State.level]);
            }
            GameMode.switchTo(GameMode.Menu);
            break;
        }
    };

    var processOrientation = function(isPortrait) {
        if (!isPortrait) {
            if (GameMode.currentMode !== GameMode.Rotate) {
                GameMode.Rotate.push();
                funf.record('orientation', 'landscape');
            }
        } else {
            if (GameMode.currentMode === GameMode.Rotate) {
                GameMode.Rotate.pop();
                funf.record('orientation', 'portrait');
            }
        }
    };
    var onOrientationChange = function(event) {
        // XXX this is xoom specific, we should really look at width/height
        var isXoom = (window.device &&
                      window.device.platform==='Android' &&
                      window.device.name==='tervigon');
        if (!isXoom) { return; }

        var isPortrait = !(window.orientation === 0 ||
                           window.orientation === 180);
        // Android sometimes gives bogus values on startup, so if this is the
        // first call to onOrientationChange, use document body size instead
        // (but note that document.body size is generally changed *after*
        // the orientationchange event is fired)
        if (!event) {
            isPortrait = (window.outerHeight >= window.outerWidth);
        }
        processOrientation(isPortrait);
    };

    function onDeviceReady() {
        funf.record('startColor', nell.color);
        funf.record('startVersion', version);

        // scale viewport width to be at least 800px
        var onResize = function() {
            var body = document.body;
            var width = body.parentElement.offsetWidth;
            if (width >= 800) {
                body.style.width =
                    body.style.height =
                    body.style.WebkitTransform =
                    body.style.MozTransform =
                    body.style.transform = '';
            } else {
                var scale = width / 800;
                body.style.width = '800px';
                body.style.height = (100/scale)+'%';
                var transform = 'scale('+scale+')';
                body.style.WebkitTransform = 'translate3d(0,0,0) '+transform;
                body.style.MozTransform = body.style.transform = transform;
            }
        };
        window.addEventListener('resize', onResize, false);
        onResize();

        // start in menu screen
        window.GameMode = GameMode;
        GameMode.Menu.switchLevel(LEVELS[0]);
        GameMode.switchTo(GameMode.Menu);
        if (HTML5_HISTORY) {
            history.replaceState(GameMode.currentMode.toJSON(),
                                 DOCUMENT_TITLE+' | Menu', '#menu');
            window.addEventListener('popstate', onPopState, false);
        }
        // install webapp?
        if (window && window.navigator &&
            window.navigator.mozApps &&
            window.navigator.mozApps.getSelf &&
            window.navigator.mozApps.install) {
            var request = window.navigator.mozApps.getSelf();
            request.onsuccess = function() {
                if (request.result) {
                    /* we're already installed, do nothing */
                    funf.record('installed', 'yes');
                } else {
                    /* not installed, prompt to install */
                    funf.record('installed', 'no');
                    GameMode.Install.doInstall = function(cb) {
                        var request = window.navigator.mozApps.install(
                            // XXX prefix not strictly required?
                            'http://nell-balloons.github.cscott.net/'+
                            'manifest.webapp');
                        request.onsuccess = function() {
                            funf.record('installed', 'success');
                            cb(true);
                        };
                        request.onerror = function() {
                            funf.record('installerror', this.error.name);
                            cb(false);
                        };
                    };
                    GameMode.Install.push();
                }
            };
            request.onerror = function() {
                funf.record('installerror', this.error.name);
                console.log('Error checking installation status: ' +
                            this.error.name);
            };
        }

        // orientation
        var isMobile = false;
        if (window.cordovaDetect) { isMobile = true; }
        else if (window.navigator) {
            // Hacky!  Why isn't there a simple method to tell whether
            // device orientation can change? (not portrait/landscape, but
            // orientation)
            var platform = window.navigator.platform.toLowerCase();
            var userAgent = window.navigator.userAgent.toLowerCase();
            if (platform.indexOf("android") >= 0 ||
                userAgent.indexOf("android;") >= 0 ||
                userAgent.indexOf(" android ") >= 0 ||
                userAgent.indexOf("tablet;") >= 0 ||
                userAgent.indexOf("fennec") >= 0) {
                isMobile = true;
            }
        }
        if (isMobile) {
            // don't prompt to rotate screen on desktop browsers!
            if (window.matchMedia) { // most reliable method
                // (not supported by Honeycomb)
                var mql = window.matchMedia(
                    "screen and (orientation: landscape)");
                var queryListener = function(m) {
                    var isPortrait = !(m.matches);
                    processOrientation(isPortrait);
                };
                mql.addListener(queryListener);
                queryListener(mql);
            } else if ('orientation' in window) { // works on xoom
                window.addEventListener('orientationchange',
                                        onOrientationChange, false);
                onOrientationChange();
            }
        }

        // phonegap
        document.addEventListener("backbutton", function() {
            if (HTML5_HISTORY) {
                history.back();
            } else { // hack!
                if (GameMode.currentMode === GameMode.Playing) {
                    GameMode.switchTo(GameMode.Menu);
                }
            }
        }, false);
        document.addEventListener('pause', onPause, false);
        document.addEventListener('resume', onResume, false);
        onVisibilityChange();
        // add top-level "anim" class unless we're on xoom/honeycomb/phonegap
        var isXoom = window.cordovaDetect && window.device &&
            (window.device.platform==='Android') &&
            //(window.device.version==='3.2.1') &&
            (window.device.name==='tervigon');
        if (!isXoom) { document.body.classList.add('anim'); }
    }
    if (window.cordovaDetect) {
        document.addEventListener("deviceready", onDeviceReady, false);
    } else {
        console.log('not on phonegap');
        onDeviceReady();
    }
});

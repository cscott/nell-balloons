define(['domReady!', './alea', './compat', './hammer'], function(document, Alea, Compat, Hammer) {
    var COLORS = [ 'black', 'lilac', 'orange', 'yellow' ]; // also 'white'
    var INITIAL_BALLOON_Y_SPEED = 100; // pixels per second
    var INITIAL_BALLOON_X_SPEED = 25;
    var NUM_BALLOONS = 2;
    var ENABLE_ACCEL = true;
    var random = Alea.Random();
    var gameElement = document.getElementById('game');
    var buttonsElement = document.getElementById('buttons');
    var balloonsElement = document.getElementById('balloons');
    var handleButtonPress;

    var ColoredElement = function(element, color) {
        this.init(element, color);
    };
    ColoredElement.prototype = {};
    ColoredElement.prototype.init = function(element, color) {
        this.domElement = element;
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
        ColoredElement.prototype.init.call(this, document.createElement('div'),
                                           color);
        this.attach(balloonsElement);
        // starting x, y, and speed
        // pick a random x position
        this.maxx = balloonsElement.offsetWidth - this.domElement.offsetWidth;
        this.x = Math.floor(random() * this.maxx);
        this.y = balloonsElement.offsetHeight;
        // speeds are in pixels / second.
        this.speedy = (0.9+0.2*random()) * INITIAL_BALLOON_Y_SPEED;
        this.speedx = (2*random()-1) * INITIAL_BALLOON_X_SPEED;
        this.refresh();
        this.domElement.style.top = '0px';
        this.domElement.style.left = '0px';
    };
    Balloon.prototype = Object.create(ColoredElement.prototype);
    Balloon.prototype.refresh = function() {
        // the 'translateZ' is actually very important here: it enables
        // GPU acceleration of this transform.
        this.domElement.style['-webkit-transform'] = 'translateX('+Math.round(this.x)+'px) translateY('+Math.round(this.y)+'px) translateZ(0)';
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

    var buttons = [];
    var createButtons = function() {
        // remove any existing buttons
        while (buttons.length > 0) {
            b = buttons.pop();
            b.detach();
            // XXX remove event handlers?
        }
        // now create four new buttons
        var c = COLORS.slice(0); // make a copy
        c.sort(function() { return random()-0.5; }); // randomize
        c.forEach(function(color) {
            var b = new Button(color);
            buttons.push(b);
            // add event handlers
        });
    };

    var balloons = [];
    var createBalloon = function() {
        // pick a random color
        var color = buttons[random.uint32() % buttons.length].color;
        var b = new Balloon(color);
        balloons.push(b);
    };

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

    var correctAnswer = function() {
    };
    var incorrectAnswer = function() {
        balloons.forEach(function(b) { b.speedy *= 1.5; });
    };

    handleButtonPress = function(color) {
        // remove the highest balloon of that color
        // XXX performance would be better if we didn't detach and then
        // create a new balloon but instead just recycled the existing
        // balloon with a new color
        var matching = balloons.filter(function(b) {
            return b.color === color;
        });
        matching.sort(function(a, b) { return a.y - b.y; });
        if (matching.length > 0) {
            matching[0].pop();
            correctAnswer(color);
        } else {
            incorrectAnswer();
        }
    };

    var refresh = (function() {
        var lastFrame = Date.now();
        return function() {
            var now = Date.now();
            var i, j, b;
            for (i=j=0; i<balloons.length; i++) {
                b = balloons[i];
                b.update(now-lastFrame);
                if (b.isGone()) {
                    b.detach();
                } else {
                    b.refresh();
                    balloons[j++] = b;
                }
            }
            balloons.length = j;
            // create new balloons to replace those lost off the top of the
            // screen.
            while (balloons.length < NUM_BALLOONS) {
                createBalloon();
            }
            lastFrame = now;
            Compat.requestAnimationFrame(refresh);
        };
    })();

    createButtons();
    createBalloon();
    refresh();
});

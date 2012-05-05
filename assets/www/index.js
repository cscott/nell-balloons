define(['domReady!', './alea', './compat', './hammer'], function(document, Alea, Compat, Hammer) {
    var COLORS = [ 'black', 'lilac', 'orange', 'yellow' ];
    var INITIAL_BALLOON_SPEED = 200; // pixels per second
    var random = Alea.Random();
    var gameElement = document.getElementById('game');
    var buttonsElement = document.getElementById('buttons');
    var balloonsElement = document.getElementById('balloons');

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
    };
    Button.prototype = Object.create(ColoredElement.prototype);

    var Balloon = function(color) {
        ColoredElement.prototype.init.call(this, document.createElement('div'),
                                           color);
        this.attach(balloonsElement);
        // starting x, y, and speed
        // pick a random x position
        var w = balloonsElement.offsetWidth - this.domElement.offsetWidth;
        this.x = Math.floor(random() * w);
        this.y = balloonsElement.offsetHeight;
        this.speed = INITIAL_BALLOON_SPEED; // px per second
        this.refresh();
    };
    Balloon.prototype = Object.create(ColoredElement.prototype);
    Balloon.prototype.refresh = function() {
        this.domElement.style.top = Math.round(this.y)+'px';
        this.domElement.style.left = Math.round(this.x)+'px';
    };
    Balloon.prototype.update = function(dt /* milliseconds */) {
        this.y -= dt * this.speed / 1000;
        // XXX drift x left and right?
    };
    Balloon.prototype.isGone = function() {
        // returns true if balloon has floated past top of screen
        return (this.y < -this.domElement.offsetHeight);
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
        return b;
    };

    var refresh = (function() {
        var lastFrame = Date.now();
        return function() {
            var now = Date.now();
            balloons.forEach(function(b, i) {
                b.update(now-lastFrame);
                if (b.isGone()) {
                    // remove/replace balloons off the top of screen
                    b.detach();
                    balloons[i] = createBalloon();
                } else {
                    b.refresh();
                }
            });
            lastFrame = now;
            Compat.requestAnimationFrame(refresh);
        };
    })();

    createButtons();
        balloons.push(createBalloon());
    refresh();
});

// Cementi – HTTP server entry point.
// Wires middleware + mounts the three route groups. Business logic lives in lib/ and routes/.

var express = require('express');
var session = require('express-session');
var compression = require('compression');
var crypto = require('crypto');
var path = require('path');

var articlesLib = require('./lib/articles');

var app = express();
var PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

articlesLib.seedArticles();

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(function (req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
});
app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax', httpOnly: true, secure: true }
}));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

app.use('/api', require('./routes/api'));
app.use('/admin', require('./routes/admin'));
app.use('/', require('./routes/pages'));

app.listen(PORT, function () {
    console.log('Cementárna v3 běží na http://localhost:' + PORT);
});

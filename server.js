const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const Database = require('better-sqlite3');
const session = require('express-session');

const app = express();
const dbPath = process.env.VERCEL ? '/tmp/organ.db' : 'organ.db';
const db = new Database(dbPath);

// Middleware
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'organ-donation-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Database Initialization
const schema = `
CREATE TABLE IF NOT EXISTS registration (
    REGISTRATION_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    FIRST_NAME TEXT,
    LAST_NAME TEXT,
    AGE INTEGER,
    BLOOD_GROUPr TEXT,
    Gender TEXT,
    EMAIL TEXT UNIQUE,
    PASS_WORD TEXT,
    phoneR TEXT,
    ADD_RESSr TEXT,
    ZIP_CODE TEXT
);

CREATE TABLE IF NOT EXISTS organ_requests (
    REQUEST_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    REGISTRATION_ID INTEGER,
    ORGAN_TYPE TEXT,
    phoneN TEXT,
    ADD_RESSn TEXT,
    ZIP_CODE TEXT,
    BLOOD_GROUPn TEXT,
    REQUEST_TYPE TEXT,
    QUANTITY INTEGER,
    REQUEST_TIME TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (REGISTRATION_ID) REFERENCES registration(REGISTRATION_ID)
);

CREATE TABLE IF NOT EXISTS donor (
    DONOR_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    REGISTRATION_ID INTEGER,
    WEIGHT REAL,
    BMI REAL,
    OPERATION_TYPE TEXT,
    OPERATION_DESC TEXT,
    DISEASE_TYPE TEXT,
    DISEASE_DESC TEXT,
    ACCIDENT_TYPE TEXT,
    ACCIDENT_DESC TEXT,
    FOREIGN KEY (REGISTRATION_ID) REFERENCES registration(REGISTRATION_ID)
);

CREATE TABLE IF NOT EXISTS donation_record (
    RECORD_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    REGISTRATION_ID INTEGER,
    BLOOD_GROUPd TEXT,
    QUANTITYd INTEGER,
    last_donated DATE,
    FOREIGN KEY (REGISTRATION_ID) REFERENCES registration(REGISTRATION_ID)
);
`;

db.exec(schema);

// Auth Middleware
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.redirect('/login');
};

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.EMAIL === 'admin@gmail') {
        return next();
    }
    res.status(403).send('Unauthorized');
};

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { EMAIL, PASS_WORD } = req.body;
    if (EMAIL === 'admin@gmail' && PASS_WORD === 'admin') {
        req.session.user = { EMAIL: EMAIL, isAdmin: true };
        return res.redirect('/dashboard');
    }

    const user = db.prepare('SELECT * FROM registration WHERE EMAIL = ? AND PASS_WORD = ?').get(EMAIL, PASS_WORD);
    if (user) {
        req.session.user = user;
        res.redirect('/logged_in');
    } else {
        res.send('Email or Password Is Not Found');
    }
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', (req, res) => {
    const { FIRST_NAME, LAST_NAME, dateofbirth, Gender, EMAIL, PASS_WORD, confirm_password, phoneR, ADD_RESSr, ZIP_CODE } = req.body;
    const BLOOD_GROUPr = req.body[' BLOOD_GROUPr'] || req.body.BLOOD_GROUPr; // Handle space in name

    if (PASS_WORD !== confirm_password) {
        return res.send('Passwords did not match');
    }

    // Calculate Age
    const dob = new Date(dateofbirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
    }

    try {
        const stmt = db.prepare('INSERT INTO registration (FIRST_NAME, LAST_NAME, AGE, BLOOD_GROUPr, Gender, EMAIL, PASS_WORD, phoneR, ADD_RESSr, ZIP_CODE) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        stmt.run(FIRST_NAME, LAST_NAME, age, BLOOD_GROUPr, Gender, EMAIL, PASS_WORD, phoneR, ADD_RESSr, ZIP_CODE);
        res.redirect('/login');
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.send('Email already registered');
        } else {
            console.error(err);
            res.status(500).send('Registration failed');
        }
    }
});

app.get('/logged_in', isAuthenticated, (req, res) => {
    res.render('logged_in', { user: req.session.user });
});

app.get('/dashboard', isAdmin, (req, res) => {
    const users = db.prepare('SELECT * FROM registration').all();
    const requests = db.prepare(`
        SELECT r.REGISTRATION_ID, r.FIRST_NAME, r.LAST_NAME, req.phoneN, req.ADD_RESSn, req.BLOOD_GROUPn, req.REQUEST_TYPE, req.QUANTITY, req.REQUEST_TIME 
        FROM organ_requests req
        JOIN registration r ON req.REGISTRATION_ID = r.REGISTRATION_ID
    `).all();
    const donors = db.prepare(`
        SELECT r.REGISTRATION_ID, r.FIRST_NAME, r.LAST_NAME, r.phoneR, r.EMAIL, COUNT(d.DONOR_ID) as total_donation
        FROM registration r
        JOIN donor d ON r.REGISTRATION_ID = d.REGISTRATION_ID
        GROUP BY r.REGISTRATION_ID
    `).all();
    const records = db.prepare(`
        SELECT r.REGISTRATION_ID, r.FIRST_NAME, r.LAST_NAME, dr.BLOOD_GROUPd, dr.QUANTITYd, dr.last_donated
        FROM registration r
        JOIN donation_record dr ON r.REGISTRATION_ID = dr.REGISTRATION_ID
    `).all();

    res.render('dashboard', { users, requests, donors, records });
});

app.get('/organ_requests', isAuthenticated, (req, res) => {
    res.render('organ_requests', { user: req.session.user });
});

app.post('/organ_requests', isAuthenticated, (req, res) => {
    const { ORGAN_TYPE, QUANTITY, ADD_RESSn, ZIP_CODE, phoneN } = req.body;
    const BLOOD_GROUPn = req.body[' BLOOD_GROUPn'] || req.body.BLOOD_GROUPn;
    const REQUEST_TYPE = req.body.REQUEST_TYPE;

    const stmt = db.prepare('INSERT INTO organ_requests (REGISTRATION_ID, ORGAN_TYPE, QUANTITY, BLOOD_GROUPn, REQUEST_TYPE, ADD_RESSn, ZIP_CODE, phoneN) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    stmt.run(req.session.user.REGISTRATION_ID, ORGAN_TYPE, QUANTITY, BLOOD_GROUPn, REQUEST_TYPE, ADD_RESSn, ZIP_CODE, phoneN);

    res.render('organ_requests', { user: req.session.user, success: true });
});

app.get('/available_to_donate', isAuthenticated, (req, res) => {
    const user = req.session.user;
    const requests = db.prepare(`
        SELECT req.REQUEST_ID, r.FIRST_NAME, r.LAST_NAME, req.phoneN, req.ORGAN_TYPE, req.BLOOD_GROUPn, req.QUANTITY, req.REQUEST_TYPE, req.ADD_RESSn, req.REQUEST_TIME
        FROM organ_requests req
        JOIN registration r ON req.REGISTRATION_ID = r.REGISTRATION_ID
        WHERE req.BLOOD_GROUPn = ?
    `).all(user.BLOOD_GROUPr);

    res.render('available_to_donate', { user, requests });
});

app.get('/donation_record', isAuthenticated, (req, res) => {
    const records = db.prepare(`
        SELECT dr.BLOOD_GROUPd, dr.QUANTITYd, dr.last_donated
        FROM donation_record dr
        WHERE dr.REGISTRATION_ID = ?
    `).all(req.session.user.REGISTRATION_ID);
    res.render('donation_record', { user: req.session.user, records });
});

app.get('/donate/:requestId', isAuthenticated, (req, res) => {
    const request = db.prepare('SELECT * FROM organ_requests WHERE REQUEST_ID = ?').get(req.params.requestId);
    if (!request) return res.redirect('/available_to_donate');
    res.render('donate_form', { user: req.session.user, request });
});

app.post('/donate/:requestId', isAuthenticated, (req, res) => {
    const { WEIGHT, BMI, OPERATION_TYPE, OPERATION_DESC, DISEASE_TYPE, DISEASE_DESC, QUANTITYd } = req.body;
    const request = db.prepare('SELECT * FROM organ_requests WHERE REQUEST_ID = ?').get(req.params.requestId);

    if (!request) return res.redirect('/available_to_donate');

    // Start a transaction
    const transaction = db.transaction(() => {
        // 1. Insert into donor table
        const insertDonor = db.prepare(`
            INSERT INTO donor (REGISTRATION_ID, WEIGHT, BMI, OPERATION_TYPE, OPERATION_DESC, DISEASE_TYPE, DISEASE_DESC) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        insertDonor.run(req.session.user.REGISTRATION_ID, WEIGHT, BMI, OPERATION_TYPE, OPERATION_DESC, DISEASE_TYPE, DISEASE_DESC);

        // 2. Insert into donation_record
        const insertRecord = db.prepare(`
            INSERT INTO donation_record (REGISTRATION_ID, BLOOD_GROUPd, QUANTITYd, last_donated) 
            VALUES (?, ?, ?, DATE('now'))
        `);
        insertRecord.run(req.session.user.REGISTRATION_ID, request.BLOOD_GROUPn, QUANTITYd);

        // 3. Delete the request (assuming it's fulfilled or partially fulfilled)
        // In a real app, you might reduce quantity, but here we'll just delete for simplicity
        db.prepare('DELETE FROM organ_requests WHERE REQUEST_ID = ?').run(req.params.requestId);
    });

    transaction();
    res.redirect('/donation_record');
});

app.post('/delete_user/:id', isAdmin, (req, res) => {
    db.prepare('DELETE FROM registration WHERE REGISTRATION_ID = ?').run(req.params.id);
    res.redirect('/dashboard');
});

app.get('/faq', (req, res) => {
    res.render('faq');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;


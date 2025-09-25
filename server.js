// server.js (Updated with Punch Out support)
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const PORT = 3000;

mongoose.connect("mongodb://127.0.0.1:27017/location-attendance", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});


const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
});
const User = mongoose.model("User", UserSchema);

const PunchSchema = new mongoose.Schema({
  username: String,
  punchInTime: Date,
  punchOutTime: Date,
  location: {
    lat: Number,
    lon: Number,
  },
});
const Punch = mongoose.model("Punch", PunchSchema);


const session = require('express-session');
const bcrypt = require('bcryptjs');

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(bodyParser.json());
app.use(session({
  secret: 'attendance_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true }
}));
// Signup API
app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required' });
  }
  const existing = await User.findOne({ username });
  if (existing) {
    return res.status(409).json({ message: 'Username already exists' });
  }
  const hash = await bcrypt.hash(password, 10);
  const user = new User({ username, password: hash });
  await user.save();
  res.json({ message: 'Signup successful' });
});

// Login API
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required' });
  }
  const user = await User.findOne({ username });
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  req.session.user = { username: user.username };
  res.json({ message: 'Login successful' });
});

// Logout API
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out' });
  });
});

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).json({ message: 'Unauthorized' });
  }
}

const OFFICE_LAT = 11.274570;
const OFFICE_LON = 77.607235;
const GEOFENCE_RADIUS_METERS = 100;

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}


// Punch In API (requires auth)
app.post("/api/punch-in", requireAuth, async (req, res) => {
  const username = req.session.user.username;
  const { lat, lon } = req.body;
  const distance = getDistance(lat, lon, OFFICE_LAT, OFFICE_LON);
  if (distance > GEOFENCE_RADIUS_METERS) {
    return res.status(403).json({ message: "Outside geofence area" });
  }
  const punch = new Punch({
    username,
    punchInTime: new Date(),
    location: { lat, lon },
  });
  await punch.save();
  res.json({ message: "Punch In successful" });
});

// Punch Out API (requires auth)
app.post("/api/punch-out", requireAuth, async (req, res) => {
  const username = req.session.user.username;
  const { lat, lon } = req.body;
  const distance = getDistance(lat, lon, OFFICE_LAT, OFFICE_LON);
  if (distance > GEOFENCE_RADIUS_METERS) {
    return res.status(403).json({ message: "Outside geofence area" });
  }
  const latest = await Punch.findOne({ username, punchOutTime: null }).sort({ punchInTime: -1 });
  if (!latest) {
    return res.status(400).json({ message: "No active punch-in found" });
  }
  latest.punchOutTime = new Date();
  await latest.save();
  res.json({ message: "Punch Out successful" });
});


// Get all punches (requires auth)
app.get("/api/punches", requireAuth, async (req, res) => {
  const data = await Punch.find({ username: req.session.user.username }).sort({ punchInTime: -1 });
  res.json(data);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

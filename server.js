// server.js (UPDATED)

const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*"
  }
});
const mongoose = require('mongoose'); // New: Mongoose for MongoDB

// --- MongoDB Configuration ---
const MONGO_URI = 'mongodb+srv://aswinmurugan2712_db_user:F7HXokfPdLD8IfKp@aswincluster.yii7zis.mongodb.net/?appName=aswincluster'; // <-- REPLACE THIS
const PORT = 5000;

// Connect to MongoDB
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Atlas Connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// Define the User Schema (stores data we need from signup)
const userSchema = new mongoose.Schema({
    uid: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    name: String,
    age: Number,
    email: String // Stored for reference, but primary login managed by Firebase Auth
});

const User = mongoose.model('User', userSchema);

// --- Express Middleware ---
app.use(express.json()); // Middleware to parse JSON body for API requests
app.use(express.static("public")); // Serve static files

// Redirect root URL to the authentication page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/auth.html');
});

// --- NEW API Endpoints for MongoDB Storage ---

// 1. POST route to save user profile data (called after Firebase SignUp)
app.post('/api/save-profile', async (req, res) => {
    const { uid, username, name, age, email } = req.body;
    try {
        const newUser = new User({ uid, username, name, age, email });
        await newUser.save();
        res.status(201).send({ message: 'Profile saved successfully.', username: newUser.username });
    } catch (err) {
        console.error('Error saving profile to MongoDB:', err);
        res.status(500).send({ message: 'Failed to save profile.', error: err.message });
    }
});

// 2. GET route to fetch username (called after Firebase Login)
app.get('/api/username/:uid', async (req, res) => {
    try {
        const userProfile = await User.findOne({ uid: req.params.uid });
        if (userProfile) {
            res.status(200).send({ username: userProfile.username });
        } else {
            res.status(404).send({ message: 'User profile not found in database.' });
        }
    } catch (err) {
        console.error('Error fetching username:', err);
        res.status(500).send({ message: 'Error fetching username.', error: err.message });
    }
});

// --- Socket.IO Logic (Unchanged) ---
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("message", (data) => {
    socket.broadcast.emit("message", data); 
  });

  socket.on("disconnect", () => {
    console.log("User left:", socket.id);
  });
});

http.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
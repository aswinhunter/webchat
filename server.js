// aswinhunter/webchat/aswinhunter-webchat-f7d516a22a34b30729574ab214798521b7686c74/server.js (UPDATED)
const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http, {
    cors: {
        origin: "*"
    }
});
const mongoose = require('mongoose');

// New: Middleware to parse JSON bodies for API calls
app.use(express.json()); 

// --- MongoDB Configuration ---
const MONGO_URI = "mongodb+srv://aswinmurugan2712_db_user:Aswin2712@aswincluster.yii7zis.mongodb.net/chat_db?retryWrites=true&w=majority";
// !! IMPORTANT: Replace the placeholder above with your actual MongoDB Atlas connection string !!

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Atlas connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Mongoose Schemas and Models ---

// Schema for storing extra user details linked to Firebase UID
const UserSchema = new mongoose.Schema({
    firebaseUid: { type: String, required: true, unique: true }, // The ID from Firebase Auth
    username: { type: String, required: true }, 
    age: { type: Number },
    details: { type: String },
    email: { type: String, required: true, unique: true }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

// Schema for storing chat messages
const MessageSchema = new mongoose.Schema({
    username: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', MessageSchema);


// --- Express API Routes for Firebase Integration ---

// 1. Save additional user details after Firebase signup (Called from auth.html)
app.post('/api/user/signup', async (req, res) => {
    const { firebaseUid, username, age, details, email } = req.body;
    try {
        const newUser = new User({ firebaseUid, username, age, details, email });
        await newUser.save();
        res.status(201).send({ message: 'User details saved successfully.' });
    } catch (error) {
        console.error('Error saving user details:', error);
        res.status(500).send({ message: 'Error saving user details.', error: error.message });
    }
});

// 2. Fetch username for the authenticated Firebase UID (Called from index.html)
app.get('/api/user/details/:firebaseUid', async (req, res) => {
    try {
        const user = await User.findOne({ firebaseUid: req.params.firebaseUid }).select('username');
        if (user) {
            res.send({ username: user.username });
        } else {
            res.status(404).send({ message: 'User not found in MongoDB.' });
        }
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).send({ message: 'Error fetching user details.', error: error.message });
    }
});

app.get('/api/user/full-details/:firebaseUid', async (req, res) => {
    try {
        // Fetch all fields except the Mongoose internal metadata
        const user = await User.findOne({ firebaseUid: req.params.firebaseUid }).select('-__v');
        if (user) {
            res.send(user); // Send the full user object
        } else {
            res.status(404).send({ message: 'User details not found in MongoDB.' });
        }
    } catch (error) {
        console.error('Error fetching full user details:', error);
        res.status(500).send({ message: 'Error fetching full user details.', error: error.message });
    }
});

// Serve static files (auth.html, index.html, CSS, JS) from the 'public' folder
app.use(express.static("public"));

// New: Redirect root URL to the authentication page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/auth.html'); // Now points to auth.html
});

app.get('/profile', (req, res) => {
    res.sendFile(__dirname + '/public/profile.html');
});


// --- Socket.io Chat Logic (Modified to store and serve history) ---
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // New: Fetch and emit message history upon connection
    Message.find().sort({ timestamp: 1 }).limit(100).then(messages => {
        socket.emit('history', messages); // Emit 'history' event to the connecting user
    }).catch(err => console.error("Error fetching history:", err));

    // Data is an object: { username: "...", text: "..." }
    socket.on("message", async (data) => {
        // 1. Save the new message to MongoDB Atlas
        try {
            const newMessage = new Message({
                username: data.username,
                text: data.text
            });
            await newMessage.save();
        } catch (error) {
            console.error('Error saving message to MongoDB:', error);
        }
        
        // 2. Broadcast the message object to everyone (including the sender, for consistency)
        io.emit("message", data);
    });

    socket.on("disconnect", () => {
        console.log("User left:", socket.id);
    });
});

http.listen(5000, () => {
    console.log("Server running on http://localhost:5000");
});
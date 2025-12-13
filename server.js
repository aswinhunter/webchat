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
// NOTE: Ensure your MONGO_URI uses the correct credentials and database name (chat_db)
const MONGO_URI = "mongodb+srv://aswinmurugan2712_db_user:Aswin2712@aswincluster.yii7zis.mongodb.net/chat_db?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Atlas connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Mongoose Schemas and Models ---

// Schema for storing user details (EXPANDED FOR DATING APP PROFILE)
const UserSchema = new mongoose.Schema({
    firebaseUid: { type: String, required: true, unique: true }, 
    username: { type: String, required: true }, 
    age: { type: Number }, // Used as a generic initial detail field
    email: { type: String, required: true, unique: true },
    
    // Updated Dating Profile Fields:
    role: { 
        type: String, 
        enum: ['Top', 'Bottom', 'Versatile', 'Versatile Top', 'Versatile Bottom', 'Power Top', 'Power Bottom', 'Prefer not to say', 'N/A'], 
        default: 'N/A' 
    },
    weight: { type: Number }, // in kg
    type: { 
        type: String, 
        enum: ['Otter', 'Bear', 'Cub', 'Wolf', 'Hunk / Jock', 'Geek / Nerd', 'Gym Bro', 'Boy-next-door', 'Drag king', 'Soft masc', 'Prefer not to say', 'N/A'], 
        default: 'N/A' 
    }, 
    about: { type: String, maxlength: 200 }, // Max length is 200 characters
    // Placeholders for future logic
    hasImage: { type: Boolean, default: false },
    locationEnabled: { type: Boolean, default: false }
    
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

// Schema for storing chat messages (Remains unchanged)
const MessageSchema = new mongoose.Schema({
    username: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    firebaseUid: { type: String, required: true }
});

const Message = mongoose.model('Message', MessageSchema);


// --- Express API Routes for Firebase and MongoDB ---

// 1. Save initial user details (Used by auth.html - UNCHANGED)
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

// 2. Fetch username (Used by index.html header - UNCHANGED)
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

// 3. Fetch ALL user details (Used by profile.html - Read - UNCHANGED)
app.get('/api/user/full-details/:firebaseUid', async (req, res) => {
    try {
        // Fetch all fields except the Mongoose internal metadata
        const user = await User.findOne({ firebaseUid: req.params.firebaseUid }).select('-__v');
        if (user) {
            res.send(user); 
        } else {
            res.status(404).send({ message: 'User details not found in MongoDB.' });
        }
    } catch (error) {
        console.error('Error fetching full user details:', error);
        res.status(500).send({ message: 'Error fetching full user details.', error: error.message });
    }
});

// 4. Update profile details (Used by profile.html - Write)
app.put('/api/user/profile/:firebaseUid', async (req, res) => {
    // Now including username and age for update
    const { username, age, role, weight, type, about, locationEnabled } = req.body;
    try {
        const updatedUser = await User.findOneAndUpdate(
            { firebaseUid: req.params.firebaseUid },
            { 
                username: username, // Now editable
                age: age,           // Now editable
                role: role, 
                weight: weight, 
                type: type, 
                about: about, 
                locationEnabled: locationEnabled 
            },
            { new: true, runValidators: true } // Return the new document and run schema validation
        );

        if (updatedUser) {
            res.send({ message: 'Profile updated successfully!', user: updatedUser });
        } else {
            res.status(404).send({ message: 'User not found.' });
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).send({ message: 'Error updating profile.', error: error.message });
    }
});

// Serve static files (auth.html, index.html, CSS, JS) from the 'public' folder
app.use(express.static("public"));

// Redirect root URL to the authentication page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/auth.html'); 
});

app.get('/profile', (req, res) => {
    res.sendFile(__dirname + '/public/profile.html');
});

app.get('/one_one_chat', (req, res) => {
    res.sendFile(__dirname + '/public/one_one_chat.html');
});

app.get('/one_one_vc', (req, res) => {
    res.sendFile(__dirname + '/public/one_one_vc.html');
});


// --- Socket.io Chat Logic (Unchanged) ---
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Fetch and emit message history upon connection
    Message.find().sort({ timestamp: 1 }).limit(100).then(messages => {
        socket.emit('history', messages); // Emit 'history' event to the connecting user
    }).catch(err => console.error("Error fetching history:", err));

    // Data is an object: { username: "...", text: "..." }
    socket.on("message", async (data) => {
        // 1. Save the new message to MongoDB Atlas
        try {
            const newMessage = new Message({
                username: data.username,
                text: data.text,
                firebaseUid: data.firebaseUid
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

http.listen(5000,"0.0.0.0", () => {
    console.log("Server running on http://localhost:5000");
});
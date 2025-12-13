const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http, {
    cors: {
        origin: "*"
    }
});
const mongoose = require('mongoose');

app.use(express.json()); 

// --- MongoDB Configuration ---
const MONGO_URI = "mongodb+srv://aswinmurugan2712_db_user:Aswin2712@aswincluster.yii7zis.mongodb.net/chat_db?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Atlas connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Mongoose Schemas and Models ---

// UserSchema remains updated with dating fields
const UserSchema = new mongoose.Schema({
    firebaseUid: { type: String, required: true, unique: true }, 
    username: { type: String, required: true }, 
    age: { type: Number }, 
    email: { type: String, required: true, unique: true },
    details: { type: String }, 
    
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
    about: { type: String, maxlength: 200 }, 
    hasImage: { type: Boolean, default: false },
    locationEnabled: { type: Boolean, default: false }
    
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

// MessageSchema for GROUP CHAT (FIXED: Added firebaseUid for persistence)
const MessageSchema = new mongoose.Schema({
    username: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    firebaseUid: { type: String, required: true } // Must be present for correct history alignment
});

const Message = mongoose.model('Message', MessageSchema);


// NEW: Schema for PRIVATE CHAT MESSAGES
const PrivateMessageSchema = new mongoose.Schema({
    senderUid: { type: String, required: true },
    receiverUid: { type: String, required: true },
    room: { type: String, required: true, index: true }, 
    senderName: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const PrivateMessage = mongoose.model('PrivateMessage', PrivateMessageSchema);


// --- Express API Routes ---

// 1. Save initial user details (FIXED)
app.post('/api/user/signup', async (req, res) => {
    const { firebaseUid, username, age, details, email } = req.body;
    try {
        const newUser = new User({ firebaseUid, username, age, details: details || '', email }); 
        await newUser.save();
        res.status(201).send({ message: 'User details saved successfully.' });
    } catch (error) {
        console.error('Error saving user details:', error);
        res.status(500).send({ message: 'Error saving user details.', error: error.message });
    }
});

// 2. Fetch current username 
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

// 3. Fetch ALL user details 
app.get('/api/user/full-details/:firebaseUid', async (req, res) => {
    try {
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

// 4. Update profile details 
app.put('/api/user/profile/:firebaseUid', async (req, res) => {
    const { username, age, role, weight, type, about, locationEnabled } = req.body;
    try {
        const updatedUser = await User.findOneAndUpdate(
            { firebaseUid: req.params.firebaseUid },
            { username, age, role, weight, type, about, locationEnabled },
            { new: true, runValidators: true }
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

// 5. Fetch Firebase UID by Username 
app.get('/api/user/uid-by-name/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username }).select('firebaseUid');
        if (user) {
            res.send({ firebaseUid: user.firebaseUid });
        } else {
            res.status(404).send({ message: `User ${req.params.username} not found.` });
        }
    } catch (error) {
        console.error('Error fetching UID by name:', error);
        res.status(500).send({ message: 'Server error.', error: error.message });
    }
});

// 6. Fetch Private Message History
app.get('/api/dm/history/:room', async (req, res) => {
    try {
        const messages = await PrivateMessage.find({ room: req.params.room })
            .sort({ timestamp: 1 })
            .limit(100);
        res.send(messages);
    } catch (error) {
        console.error('Error fetching DM history:', error);
        res.status(500).send({ message: 'Error fetching DM history.', error: error.message });
    }
});

// 7. NEW: API endpoint to fetch Group Chat History (used by index.html onload)
app.get('/api/group/history', async (req, res) => {
    try {
        const messages = await Message.find().sort({ timestamp: 1 }).limit(100);
        res.send(messages);
    } catch (error) {
        console.error('Error fetching group chat history:', error);
        res.status(500).send({ message: 'Error fetching group chat history.', error: error.message });
    }
});

// --- Socket.io Chat Logic ---

const createRoomName = (uid1, uid2) => {
    const sortedUids = [uid1, uid2].sort();
    return `${sortedUids[0]}_${sortedUids[1]}`;
};

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on('identify', (data) => {
        const { firebaseUid } = data;
        if (firebaseUid) {
            socket.join(firebaseUid); 
            console.log(`User ${firebaseUid} identified and joined room.`);
        }
    });

    // Group Chat Messaging (index.html)
    socket.on("message", async (data) => {
        // FIX: Ensure firebaseUid is available on incoming data
        const { username, text, firebaseUid } = data;
        try {
            const newMessage = new Message({
                username,
                text,
                firebaseUid // Save the UID
            });
            await newMessage.save();
        } catch (error) {
            console.error('Error saving group message to MongoDB:', error);
        }
        
        io.emit("message", data); 
    });

    // Private Chat Messaging (dm_chat.html)
    socket.on("privateMessage", async (data) => {
        const { senderUid, receiverUid, senderName, text } = data;
        const room = createRoomName(senderUid, receiverUid);

        // 1. Save the private message
        try {
            const newPrivateMessage = new PrivateMessage({
                senderUid,
                receiverUid,
                room,
                senderName,
                text
            });
            await newPrivateMessage.save();
        } catch (error) {
            console.error('Error saving private message to MongoDB:', error);
        }
        
        // 2. Emit the message to both the sender and the receiver's rooms
        io.to(senderUid).emit("privateMessage", data);
        io.to(receiverUid).emit("privateMessage", data);
    });

    socket.on("disconnect", () => {
        console.log("User left:", socket.id);
    });
});


// Serve static files and new routes
app.use(express.static("public"));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/auth.html'); 
});

app.get('/profile', (req, res) => {
    res.sendFile(__dirname + '/public/profile.html');
});

// New routes for placeholder pages
app.get('/one_one_chat.html', (req, res) => {
    res.sendFile(__dirname + '/public/one_one_chat.html');
});

app.get('/one_one_vc.html', (req, res) => {
    res.sendFile(__dirname + '/public/one_one_vc.html');
});

http.listen(5000, "0.0.0.0", () => {
    console.log("Server running on http://localhost:5000");
});
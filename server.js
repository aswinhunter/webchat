const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http, {
    cors: {
        origin: "*"
    }
});
const mongoose = require('mongoose');
const crypto = require('crypto');

app.use(express.json()); 

// --- Cloudinary Configuration ---
const CLOUDINARY_CLOUD_NAME = 'dbuvfb1ye';
const CLOUDINARY_API_KEY = '811241234641619';
const CLOUDINARY_API_SECRET = 'Nlsm9cOW5ObSCudLvucVEBbeTbE';

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
    photoUrls: { type: [String], default: [] } // Cloudinary image URLs
    
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

// MessageSchema for GROUP CHAT (Includes firebaseUid for efficient name lookup)
const MessageSchema = new mongoose.Schema({
    username: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    firebaseUid: { type: String, required: true } 
});

// TTL index: expire group chat messages after 1 day (86400 seconds)
MessageSchema.index({ timestamp: 1 }, { expireAfterSeconds: 86400 });

const Message = mongoose.model('Message', MessageSchema);


// PrivateMessageSchema (Placeholder/Future Use)
const PrivateMessageSchema = new mongoose.Schema({
    senderUid: { type: String, required: true },
    receiverUid: { type: String, required: true },
    room: { type: String, required: true, index: true }, 
    senderName: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

// TTL index: expire one-to-one (DM) messages after 7 days (604800 seconds)
PrivateMessageSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });

const PrivateMessage = mongoose.model('PrivateMessage', PrivateMessageSchema);


// --- Express API Routes ---

// 1. Save initial user details
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
    const { username, age, role, weight, type, about } = req.body;
    try {
        const updatedUser = await User.findOneAndUpdate(
            { firebaseUid: req.params.firebaseUid },
            { username, age, role, weight, type, about },
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

// 4.5 Update user photo URLs (from Cloudinary)
app.put('/api/user/photos/:firebaseUid', async (req, res) => {
    const { photoUrls } = req.body;
    try {
        if (!Array.isArray(photoUrls) || photoUrls.length > 4) {
            return res.status(400).send({ message: 'photoUrls must be an array with max 4 items.' });
        }

        const updatedUser = await User.findOneAndUpdate(
            { firebaseUid: req.params.firebaseUid },
            { photoUrls },
            { new: true, runValidators: true }
        );

        if (updatedUser) {
            res.send({ message: 'Photos updated successfully!', photoUrls: updatedUser.photoUrls });
        } else {
            res.status(404).send({ message: 'User not found.' });
        }
    } catch (error) {
        console.error('Error updating photos:', error);
        res.status(500).send({ message: 'Error updating photos.', error: error.message });
    }
});

// 4.6 Delete photo from Cloudinary and MongoDB
app.delete('/api/user/photos/:firebaseUid/:index', async (req, res) => {
    const { firebaseUid, index } = req.params;
    
    try {
        // Get user document
        const user = await User.findOne({ firebaseUid });
        if (!user) {
            return res.status(404).send({ message: 'User not found.' });
        }

        const photoUrl = user.photoUrls[index];
        if (!photoUrl) {
            return res.status(404).send({ message: 'Photo not found.' });
        }

        // Extract public_id from Cloudinary URL
        // URL format: https://res.cloudinary.com/{cloud}/image/upload/{version}/{public_id}
        const urlParts = photoUrl.split('/');
        const publicIdWithExt = urlParts[urlParts.length - 1];
        const publicId = urlParts.slice(7).join('/').split('.')[0]; // Extract everything after /upload/v... and remove extension

        // Delete from Cloudinary using Admin API
        const timestamp = Math.floor(Date.now() / 1000);
        const authString = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
        const signature = crypto.createHash('sha1').update(authString).digest('hex');

        const cloudinaryDeleteUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`;
        const formData = new URLSearchParams();
        formData.append('public_id', publicId);
        formData.append('signature', signature);
        formData.append('api_key', CLOUDINARY_API_KEY);
        formData.append('timestamp', timestamp);

        const cloudinaryResponse = await fetch(cloudinaryDeleteUrl, {
            method: 'POST',
            body: formData
        });

        const cloudinaryData = await cloudinaryResponse.json();
        console.log('Cloudinary delete response:', cloudinaryData);

        // Remove from MongoDB
        user.photoUrls[index] = null;
        user.photoUrls = user.photoUrls.filter(url => url !== null);
        await user.save();

        res.send({ message: 'Photo deleted from Cloudinary and MongoDB!', photoUrls: user.photoUrls });
    } catch (error) {
        console.error('Error deleting photo:', error);
        res.status(500).send({ message: 'Error deleting photo.', error: error.message });
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

// 6. Fetch Private Message History (Placeholder)
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

// 7. API endpoint to fetch Group Chat History (used by index.html onload)
app.get('/api/group/history', async (req, res) => {
    try {
        const messages = await Message.find().sort({ timestamp: 1 }).limit(100);
        res.send(messages);
    } catch (error) {
        console.error('Error fetching group chat history:', error);
        res.status(500).send({ message: 'Error fetching group chat history.', error: error.message });
    }
});

// 8. NEW: API endpoint to fetch name map (low computation lookup)
app.get('/api/users/name-map', async (req, res) => {
    try {
        // Only fetching the UID and current username from the small User collection
        const users = await User.find({}).select('firebaseUid username -_id');
        
        // Convert the list into an easy-to-use map: { "uid1": "name1", "uid2": "name2", ... }
        const userMap = users.reduce((map, user) => {
            map[user.firebaseUid] = user.username;
            return map;
        }, {});
        
        res.send(userMap);
    } catch (error) {
        console.error('Error fetching current usernames map:', error);
        res.status(500).send({ message: 'Error fetching current usernames.', error: error.message });
    }
});


// --- Socket.io Chat Logic ---

const createRoomName = (uid1, uid2) => {
    const sortedUids = [uid1, uid2].sort();
    return `${sortedUids[0]}_${sortedUids[1]}`;
};

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Track the Firebase UID for each socket for simple auth checks
    socket.on('identify', (data) => {
        const { firebaseUid } = data;
        if (firebaseUid) {
            socket.firebaseUid = firebaseUid;
            socket.join(firebaseUid); // personal channel
            console.log(`User ${firebaseUid} identified and joined personal room.`);
        }
    });

    // Group Chat Messaging (index.html)
    socket.on("message", async (data) => {
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

    // Private Chat Messaging: Join room & forward
    socket.on('joinPrivate', (data) => {
        const { room } = data;
        if (!room) return;
        socket.join(room);
        console.log(`Socket ${socket.id} joined private room ${room}`);
    });

    socket.on("privateMessage", async (data) => {
        const { senderUid, receiverUid, room, senderName, text } = data;

        // Basic server-side verification: ensure the socket's firebaseUid matches the senderUid.
        if (!socket.firebaseUid || socket.firebaseUid !== senderUid) {
            console.warn(`Socket verification failed. socket.firebaseUid=${socket.firebaseUid} senderUid=${senderUid}`);
            return;
        }

        try {
            const newPrivate = new PrivateMessage({
                senderUid,
                receiverUid,
                room,
                senderName,
                text
            });
            await newPrivate.save();

            // Emit only to the private room
            io.to(room).emit("privateMessage", {
                senderUid,
                receiverUid,
                room,
                senderName,
                text,
                timestamp: newPrivate.timestamp
            });
        } catch (error) {
            console.error('Error saving private message to MongoDB:', error);
        }
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

// 6b. Fetch DM peers for a user: return peers who sent/received messages with the given UID
app.get('/api/dm/peers/:firebaseUid', async (req, res) => {
    try {
        const uid = req.params.firebaseUid;
        // Pull messages where the user is sender or receiver
        const messages = await PrivateMessage.find({ $or: [{ senderUid: uid }, { receiverUid: uid }] }).sort({ timestamp: -1 }).limit(1000);

        // Build map of peerUid -> latest message and timestamp
        const peersMap = {};
        messages.forEach(msg => {
            const peerUid = msg.senderUid === uid ? msg.receiverUid : msg.senderUid;
            if (!peersMap[peerUid] || new Date(msg.timestamp) > new Date(peersMap[peerUid].timestamp)) {
                peersMap[peerUid] = { lastMessage: msg.text, timestamp: msg.timestamp };
            }
        });

        // Convert to array and populate with username
        const peerUids = Object.keys(peersMap);
        const users = await User.find({ firebaseUid: { $in: peerUids } }).select('firebaseUid username -_id');
        const usersMap = users.reduce((m, u) => { m[u.firebaseUid] = u.username; return m; }, {});

        const peers = peerUids.map(uid => ({
            uid,
            username: usersMap[uid] || 'Unknown',
            lastMessage: peersMap[uid].lastMessage,
            timestamp: peersMap[uid].timestamp
        })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.send(peers);
    } catch (error) {
        console.error('Error fetching DM peers:', error);
        res.status(500).send({ message: 'Error fetching DM peers.', error: error.message });
    }
});
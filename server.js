const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*"
  }
});

// Serve static files (login.html, index.html, CSS, JS) from the 'public' folder
app.use(express.static("public")); 

// New: Redirect root URL to the login page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Data is an object: { username: "...", text: "..." }
  socket.on("message", (data) => {
    // Broadcast the message object to everyone *except* the sender.
    socket.broadcast.emit("message", data); 
  });

  socket.on("disconnect", () => {
    console.log("User left:", socket.id);
  });
});

http.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
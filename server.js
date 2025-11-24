const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*"
  }
});

app.use(express.static("public")); // Assuming index.html is in a 'public' folder

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("message", (data) => {
    // 🛑 CORRECTED: Use socket.broadcast.emit() to send the message
    // to everyone *except* the sender (the socket that emitted the message).
    // The sender will display the message locally in their own browser.
    socket.broadcast.emit("message", data); 
  });

  socket.on("disconnect", () => {
    console.log("User left:", socket.id);
  });
});

http.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
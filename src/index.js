import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { generateMessage, generateLocationMessage } from "./utils/messages.js";
import { addUser, removeUser, getUser, getUsersInRoom } from "./utils/user.js";

// -------------------- Load Environment Variables ---------------------------
dotenv.config();

// -------------------- Fix __dirname for ES Modules -------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------- Express Setup ----------------------------------------
const app = express();
const server = http.createServer(app);

// -------------------- Socket.io Setup with CORS ----------------------------
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// -------------------- Middlewares ------------------------------------------
app.use(express.json());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

// -------------------- Serve Static Frontend (Optional) ----------------------
const publicDirectoryPath = path.join(__dirname, "../public");
app.use(express.static(publicDirectoryPath));

// -------------------- Translation Endpoint ----------------------------------
app.post("/translate", (req, res) => {
  const { text } = req.body;

  console.log("Received for translation:", text);

  // Dummy translation logic — you can replace this with real API call
  const translatedText = text + " (translated)";

  res.send({
    contents: {
      translated: translatedText,
    },
  });
});

// -------------------- Socket.io Events --------------------------------------
io.on("connection", (socket) => {
  console.log("🟢 New WebSocket connection");

  // Joining room
  socket.on("join", ({ username, room }, callback) => {
    const { error, user } = addUser({ id: socket.id, username, room });
    if (error) return callback(error);

    socket.join(room);
    socket.emit("message", generateMessage("Admin", "Welcome!"));
    socket.broadcast
      .to(user.room)
      .emit("message", generateMessage("Admin", `${user.username} has joined`));

    io.to(user.room).emit("roomData", {
      room: user.room,
      users: getUsersInRoom(user.room),
    });

    callback();
  });

  // Message sending (Without bad words filter)
  socket.on("sendMessage", (message, callback) => {
    const user = getUser(socket.id);
    if (!user) return callback("You are not authenticated");

    io.to(user.room).emit("message", generateMessage(user.username, message));
    callback();
  });

  // Location sharing
  socket.on("sendLocation", (coords, callback) => {
    const user = getUser(socket.id);
    if (!user) return callback("You are not authenticated");

    io.to(user.room).emit(
      "locationMessage",
      generateLocationMessage(
        user.username,
        `https://google.com/maps?q=${coords.Latitude},${coords.Longitude}`
      )
    );
    callback();
  });

  // On disconnect
  socket.on("disconnect", () => {
    const user = removeUser(socket.id);
    if (user) {
      io.to(user.room).emit(
        "message",
        generateMessage("Admin", `${user.username} has left`)
      );
      io.to(user.room).emit("roomData", {
        room: user.room,
        users: getUsersInRoom(user.room),
      });
    }
  });
});

// -------------------- Port Setup for Local & Deploy -------------------------
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

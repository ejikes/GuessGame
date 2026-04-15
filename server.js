const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const GameSession = require('./src/gameSession');

const { PORT } = require('./config/constants');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from "public" folder
app.use(express.static(path.join(__dirname, "public")));

// Initialize game session
const gameSession = new GameSession({ io });

io.on("connection", (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  // Send socket ID to client for identification
  socket.emit("player_connected", { id: socket.id });

  // 🔹 Join game
  socket.on("join", (event) => {
    gameSession.join({ event, socket });
  });

  // 🔹 Create question (GM only)
  socket.on("create_question", (event) => {
    gameSession.createQuestion({ event, socket });
  });

  // 🔹 Start game round (GM only) - NEW
  socket.on("start_game", () => {
    gameSession.startGame({ socket });
  });

  // 🔹 Submit guess
  socket.on("guess_answer", (event) => {
    gameSession.guessAnswer({ event, socket });
  });

  // 🔹 Handle disconnect
  socket.on("disconnect", () => {
    gameSession.exit({ socket });
    console.log(`❌ User disconnected: ${socket.id}`);
  });

  // 🔹 Generic error handler for client
  socket.on("error", (err) => {
    console.error(`Socket error from ${socket.id}:`, err);
  });
});

// Handle server errors
server.on("error", (err) => {
  console.error("Server error:", err);
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
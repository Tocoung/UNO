import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameEngine } from './gameEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve frontend build files from the 'frontend/dist' directory statically
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Catch-all route to serve the SPA index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

const PORT = process.env.PORT || 3000;
const rooms = {};

// When a room is created or modified, broadcast state
const broadcastGameState = (roomId) => {
  if (rooms[roomId]) {
    io.to(roomId).emit('gameState', rooms[roomId].getState());
  }
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('joinRoom', ({ roomId, playerName }) => {
    // Basic Custom Room Creation/Join logic
    socket.join(roomId);

    if (!rooms[roomId]) {
      console.log(`Creating new room: ${roomId}`);
      rooms[roomId] = new GameEngine(roomId, broadcastGameState, (event, data) => io.to(roomId).emit(event, data));
    }

    const game = rooms[roomId];
    const joined = game.addPlayer(socket.id, playerName);

    if (joined) {
      console.log(`${playerName} (${socket.id}) joined room ${roomId}`);
      socket.emit('joined', { roomId, playerId: socket.id });
      broadcastGameState(roomId);
    } else {
      socket.emit('error', 'Cannot join room. Game may have already started or room is full.');
    }
  });

  socket.on('startGame', (roomId) => {
    const game = rooms[roomId];
    if (game && game.players.length >= 2) {
      game.start();
    } else if (game && game.players.length < 2) {
      socket.emit('error', 'Need at least 2 players to start the game.');
    }
  });

  socket.on('addBot', (roomId) => {
    const game = rooms[roomId];
    if (game && game.status === 'WAITING') {
      const botId = 'bot_' + Math.random().toString(36).substring(2, 9);
      const botNumber = game.players.filter(p => p.isAI).length + 1;
      const joined = game.addPlayer(botId, `Bot ${botNumber}`, true);
      if (joined) {
        broadcastGameState(roomId);
      }
    }
  });

  socket.on('playCard', ({ roomId, cardIndex }) => {
    const game = rooms[roomId];
    if (game && game.getCurrentPlayer() === socket.id) {
      game.playCard(socket.id, cardIndex);
    }
  });

  socket.on('drawCard', (roomId) => {
    const game = rooms[roomId];
    if (game && game.getCurrentPlayer() === socket.id) {
      game.drawCard(socket.id);
    }
  });

  socket.on('chooseColor', ({ roomId, color }) => {
    const game = rooms[roomId];
    if (game && game.status === 'WAITING_COLOR' && game.pendingWildPlayer === socket.id) {
      game.chooseColor(socket.id, color);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Clean up players from rooms
    for (const roomId in rooms) {
      const game = rooms[roomId];
      if (game.hasPlayer(socket.id)) {
        game.removePlayer(socket.id);
        if (game.players.length === 0) {
          delete rooms[roomId];
          console.log(`Room ${roomId} deleted because it became empty.`);
        } else {
          broadcastGameState(roomId);
        }
      }
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});

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
const socketToPlayer = {}; // Map socket.id to { roomId, playerId }

// When a room is created or modified, broadcast state
const broadcastGameState = (roomId) => {
  if (rooms[roomId]) {
    io.to(roomId).emit('gameState', rooms[roomId].getState());
  }
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('joinRoom', ({ roomId, playerName, playerId }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      console.log(`Creating new room: ${roomId}`);
      rooms[roomId] = new GameEngine(roomId, broadcastGameState, (event, data) => io.to(roomId).emit(event, data));
    }

    const game = rooms[roomId];
    // Use provided playerId or generate a new one
    const pId = playerId || 'player_' + Math.random().toString(36).substring(2, 15);
    socketToPlayer[socket.id] = { roomId, playerId: pId };

    const joined = game.addPlayer(pId, playerName);

    if (joined || game.hasPlayer(pId)) {
      console.log(`${playerName} (${pId}) joined/rejoined room ${roomId} on socket ${socket.id}`);
      socket.emit('joined', { roomId, playerId: pId, playerName });
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
    const pId = socketToPlayer[socket.id]?.playerId;
    if (game && pId && game.getCurrentPlayer() === pId) {
      game.playCard(pId, cardIndex);
    }
  });

  socket.on('drawCard', (roomId) => {
    const game = rooms[roomId];
    const pId = socketToPlayer[socket.id]?.playerId;
    if (game && pId && game.getCurrentPlayer() === pId) {
      game.drawCard(pId);
    }
  });

  socket.on('chooseColor', ({ roomId, color }) => {
    const game = rooms[roomId];
    const pId = socketToPlayer[socket.id]?.playerId;
    if (game && pId && game.status === 'WAITING_COLOR' && game.pendingWildPlayer === pId) {
      game.chooseColor(pId, color);
    }
  });

  socket.on('leaveRoom', (roomId) => {
    const game = rooms[roomId];
    const pId = socketToPlayer[socket.id]?.playerId;
    if (game && pId && game.hasPlayer(pId)) {
      game.removePlayer(pId);
      socket.leave(roomId);
      delete socketToPlayer[socket.id];
      if (game.players.length === 0) {
        delete rooms[roomId];
        console.log(`Room ${roomId} deleted because it became empty.`);
      } else {
        broadcastGameState(roomId);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // We do NOT remove the player from the game here anymore!
    // They stay in the room and can rejoin if they reconnect.
    delete socketToPlayer[socket.id];
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});

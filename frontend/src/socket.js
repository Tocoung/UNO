import { io } from 'https://cdn.socket.io/4.7.4/socket.io.esm.min.js';

const URL = import.meta.env.PROD ? window.location.origin : `http://${window.location.hostname}:3000`;

export const socket = io(URL, {
    autoConnect: false,
    transports: ['websocket', 'polling']
});

let gameStateCallback = null;
let errorCallback = null;

socket.on('gameState', (state) => {
    if (gameStateCallback) gameStateCallback(state);
});

socket.on('error', (msg) => {
    if (errorCallback) errorCallback(msg);
});

export const setupSocketListeners = (onStateUpdate, onError) => {
    gameStateCallback = onStateUpdate;
    errorCallback = onError;
};

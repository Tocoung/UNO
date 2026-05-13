import { socket, setupSocketListeners } from './socket.js';
import { createParticles, animateCardThrow, shakeElement } from './animations.js';

const DOM = {
    setup: {
        overlay: document.getElementById('setup-overlay'),
        playerInput: document.getElementById('player-name-input'),
        roomInput: document.getElementById('room-name-input'),
        joinBtn: document.getElementById('join-btn'),
        errorMsg: document.getElementById('setup-error')
    },
    board: {
        container: document.getElementById('game-board'),
        roomDisplay: document.getElementById('room-display'),
        addBotBtn: document.getElementById('add-bot-btn'),
        startBtn: document.getElementById('start-game-btn'),
        drawPile: document.getElementById('draw-pile'),
        discardPile: document.getElementById('discard-pile'),
        hand: document.getElementById('player-hand'),
        opponents: document.getElementById('opponents-container'),
        status: document.getElementById('status-message'),
        colorPicker: document.getElementById('color-picker'),
        colorBtns: document.querySelectorAll('.color-btn'),
        exitBtn: document.getElementById('exit-btn')
    },
    rules: {
        btn: document.getElementById('rules-btn'),
        overlay: document.getElementById('rules-overlay'),
        closeBtn: document.getElementById('close-rules-btn')
    },
    leaderboard: {
        overlay: document.getElementById('leaderboard-overlay'),
        list: document.getElementById('leaderboard-list'),
        closeBtn: document.getElementById('close-leaderboard-btn')
    }
};

let currentState = null;
let myPlayerId = null;
let selectedCardIndex = null;

// Initialization
function init() {
    socket.connect();

    socket.on('connect', () => {
        console.log("Connected to server with ID:", socket.id);
        
        // Auto-rejoin if session exists
        const session = sessionStorage.getItem('uno_session');
        if (session) {
            const { roomId, playerName, playerId } = JSON.parse(session);
            console.log("Found existing session. Rejoining...");
            socket.emit('joinRoom', { roomId, playerName, playerId });
        }
    });

    socket.on('disconnect', () => {
        if (currentState && currentState.status === 'PLAYING') {
            DOM.board.status.textContent = 'Connection Lost. Waiting for reconnect...';
        }
    });

    socket.on('connect_error', (err) => {
        console.log("Connection Error:", err.message);
        DOM.setup.errorMsg.textContent = 'Server connection failed.';
    });

    DOM.setup.joinBtn.addEventListener('click', () => {
        const playerName = DOM.setup.playerInput.value.trim();
        const roomId = DOM.setup.roomInput.value.trim();

        console.log("Join btn clicked:", playerName, roomId);
        console.log("Socket connected?:", socket.connected);

        if (playerName && roomId) {
            if (!socket.connected) {
                socket.connect();
            }
            socket.emit('joinRoom', { roomId, playerName });
        } else {
            DOM.setup.errorMsg.textContent = 'Please enter both strings.';
        }
    });

    if (DOM.board.exitBtn) {
        DOM.board.exitBtn.addEventListener('click', () => {
            if (currentState && currentState.roomId) {
                socket.emit('leaveRoom', currentState.roomId);
            }
            sessionStorage.removeItem('uno_session');
            currentState = null;
            myPlayerId = null;
            DOM.setup.overlay.classList.remove('hidden');
            DOM.board.container.classList.add('hidden');
            DOM.setup.playerInput.value = '';
            DOM.setup.roomInput.value = '';
        });
    }

    socket.on('joined', ({ roomId, playerId, playerName }) => {
        myPlayerId = playerId;
        // Save persistent session
        sessionStorage.setItem('uno_session', JSON.stringify({ roomId, playerId, playerName }));
        
        DOM.setup.overlay.classList.add('hidden');
        DOM.board.container.classList.remove('hidden');
        DOM.board.roomDisplay.textContent = `Room: ${roomId}`;
    });

    DOM.board.startBtn.addEventListener('click', () => {
        socket.emit('startGame', currentState.roomId);
    });

    if (DOM.board.addBotBtn) {
        DOM.board.addBotBtn.addEventListener('click', () => {
            if (currentState && currentState.roomId) {
                socket.emit('addBot', currentState.roomId);
            }
        });
    }

    socket.on('ai_thinking', (botId) => {
        const p = currentState?.players.find(p => p.id === botId);
        if (p) {
            DOM.board.status.textContent = `🤖 ${p.name} is thinking...`;
        }
    });

    DOM.board.drawPile.addEventListener('click', () => {
        if (isMyTurn()) {
            socket.emit('drawCard', currentState.roomId);
        }
    });

    DOM.rules.btn.addEventListener('click', () => DOM.rules.overlay.classList.remove('hidden'));
    DOM.rules.closeBtn.addEventListener('click', () => DOM.rules.overlay.classList.add('hidden'));

    DOM.board.colorBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const color = e.target.dataset.color;
            if (currentState && currentState.roomId && currentState.status === 'WAITING_COLOR' && currentState.pendingWildPlayer === myPlayerId) {
                socket.emit('chooseColor', { roomId: currentState.roomId, color });
                DOM.board.colorPicker.classList.add('hidden');
            }
        });
    });

    DOM.leaderboard.closeBtn.addEventListener('click', () => {
        socket.emit('startGame', currentState.roomId);
        DOM.leaderboard.overlay.classList.add('hidden');
    });

    setupSocketListeners(renderState, (msg) => {
        alert(msg);
    });

    // Deselect card if clicking outside the hand
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.hand-card-wrapper') && selectedCardIndex !== null) {
            selectedCardIndex = null;
            renderState(currentState); // Re-render to reset visually
        }
    });
}

// Helpers
function isMyTurn() {
    return currentState && currentState.currentPlayerId === myPlayerId;
}

function getCardColorClass(color) {
    if (color === 'red') return 'red';
    if (color === 'blue') return 'blue';
    if (color === 'green') return 'green';
    if (color === 'yellow') return 'yellow';
    return 'black';
}

function createCardHTML(card, playable = false, onClick = null) {
    const el = document.createElement('div');
    el.className = `card ${getCardColorClass(card.color)}`;
    if (playable) el.classList.add('playable');

    let content = card.type;
    if (card.type === 'draw2') content = '+2';
    if (card.type === 'wild') content = 'WILD';
    if (card.type === 'wild4') content = '+4';

    el.innerHTML = `<span>${content}</span>`;

    if (onClick) {
        el.addEventListener('click', onClick);
    }
    return el;
}

// Render Logic
function renderState(state) {
    const oldState = currentState;
    currentState = state;

    // Manage UI visibility
    if (state.status === 'WAITING') {
        DOM.board.startBtn.classList.remove('hidden');
        if (DOM.board.addBotBtn) DOM.board.addBotBtn.classList.remove('hidden');
        DOM.board.status.textContent = 'Waiting for players...';
    } else if (state.status === 'FINISHED') {
        DOM.board.startBtn.classList.add('hidden');
        if (DOM.board.addBotBtn) DOM.board.addBotBtn.classList.add('hidden');
        DOM.board.status.textContent = `Round Over!`;

        // Render Leaderboard
        if (!oldState || oldState.status !== 'FINISHED') {
            DOM.leaderboard.list.innerHTML = '';
            state.finishedRank.forEach((pid, idx) => {
                const player = state.players.find(p => p.id === pid);
                if (player) {
                    const li = document.createElement('li');
                    li.innerHTML = `<span>#${idx + 1}</span> <span>${player.name}</span>`;
                    DOM.leaderboard.list.appendChild(li);
                }
            });
            DOM.leaderboard.overlay.classList.remove('hidden');
            createParticles(window.innerWidth / 2, window.innerHeight / 2, '#ffcc00');
        }
    } else if (state.status === 'WAITING_COLOR') {
        DOM.board.startBtn.classList.add('hidden');
        if (DOM.board.addBotBtn) DOM.board.addBotBtn.classList.add('hidden');

        if (state.pendingWildPlayer === myPlayerId) {
            DOM.board.status.textContent = "Choose a Color!";
            DOM.board.colorPicker.classList.remove('hidden');
        } else {
            DOM.board.colorPicker.classList.add('hidden');
            const p = state.players.find(p => p.id === state.pendingWildPlayer);
            DOM.board.status.textContent = `${p?.name} is choosing a color...`;
        }
    } else {
        DOM.board.startBtn.classList.add('hidden');
        if (DOM.board.addBotBtn) DOM.board.addBotBtn.classList.add('hidden');
        DOM.board.colorPicker.classList.add('hidden');

        if (isMyTurn()) {
            DOM.board.status.textContent = "Your Turn!";
        } else {
            const p = state.players.find(p => p.id === state.currentPlayerId);
            DOM.board.status.textContent = `${p?.name}'s Turn`;
        }
    }

    // Draw Discard Pile
    DOM.board.discardPile.innerHTML = '';
    if (state.topCard) {
        const topCardEl = createCardHTML({
            color: state.activeColor || state.topCard.color,
            type: state.topCard.type
        });
        // Add random slight rotation to center pile for realism
        topCardEl.style.transform = `rotate(${(Math.random() - 0.5) * 20}deg)`;
        DOM.board.discardPile.appendChild(topCardEl);

        // Effects triggered based on new top card (super simple diffing)
        if (oldState && oldState.topCard && (oldState.topCard.type !== state.topCard.type || oldState.topCard.color !== state.topCard.color)) {
            if (['skip', 'reverse'].includes(state.topCard.type)) {
                setTimeout(() => {
                    // Find current player avatar and shake it
                    const avatarEls = document.querySelectorAll('.avatar.active');
                    if (avatarEls.length > 0) shakeElement(avatarEls[0]);
                }, 100);
            }
            if (['draw2', 'wild4'].includes(state.topCard.type)) {
                const rect = DOM.board.discardPile.getBoundingClientRect();
                createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 'white');
            }
        }
    }

    // Draw My Hand
    DOM.board.hand.innerHTML = '';
    const me = state.players.find(p => p.id === myPlayerId);
    if (me && me.hand) {
        const total = me.hand.length;
        me.hand.forEach((card, index) => {
            // Is Playable?
            let playable = false;
            if (isMyTurn() && state.status !== 'WAITING_COLOR') {
                if (card.color === 'black') playable = true;
                else if (state.topCard) {
                    if (card.color === state.activeColor || card.type === state.topCard.type) playable = true;
                } else {
                    playable = true; // First play ever?
                }
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'hand-card-wrapper';

            // Calculate curve math
            const maxAngle = 40;
            const angleStep = total > 1 ? (maxAngle * 2) / (total - 1) : 0;
            const angle = -maxAngle + (index * angleStep);
            const translateY = Math.abs(angle) * 1.5;

            // Calculate horizontal spread so they don't pile up on each other
            const baseSpacing = 40;
            const spacing = Math.max(20, baseSpacing - (total * 1.5)); // Compress slightly as cards increase, but keep a minimum 20px
            const translateX = (index - (total - 1) / 2) * spacing;

            // Apply transforms (Translate X first for spreading, then Y and Rotate for curve)
            wrapper.style.transform = `translateX(${translateX}px) translateY(${translateY}px) rotate(${angle}deg)`;
            wrapper.style.zIndex = index;

            // Apply selected visual state
            if (selectedCardIndex === index) {
                // If it's selected, keep it popped up
                wrapper.style.transform = `translateX(${translateX}px) translateY(-50px) scale(1.15) rotate(0deg)`;
                wrapper.style.zIndex = 100;
            }

            const cardEl = createCardHTML(card, playable, (e) => {
                if (playable) {
                    e.stopPropagation(); // Prevent document click from deselecting immediately
                    if (selectedCardIndex === index) {
                        // Play card
                        socket.emit('playCard', { roomId: state.roomId, cardIndex: index });
                        selectedCardIndex = null;
                    } else {
                        // Select card
                        selectedCardIndex = index;
                        renderState(state); // Re-render to apply selection visuals
                    }
                }
            });

            wrapper.appendChild(cardEl);
            DOM.board.hand.appendChild(wrapper);

            // Hover adjustment trick (Desktop still gets hover benefits)
            wrapper.addEventListener('mouseenter', () => {
                if (selectedCardIndex !== index) {
                    wrapper.style.transform = `translateX(${translateX}px) translateY(-50px) scale(1.15) rotate(0deg)`;
                    wrapper.style.zIndex = 100;
                }
            });
            wrapper.addEventListener('mouseleave', () => {
                if (selectedCardIndex !== index) {
                    wrapper.style.transform = `translateX(${translateX}px) translateY(${translateY}px) rotate(${angle}deg)`;
                    wrapper.style.zIndex = index;
                }
            });
        });
    }

    // Draw Opponents
    DOM.board.opponents.innerHTML = '';
    const opponents = state.players.filter(p => p.id !== myPlayerId);
    opponents.forEach(opp => {
        const av = document.createElement('div');
        av.className = `avatar ${state.currentPlayerId === opp.id ? 'active' : ''}`;
        av.innerHTML = `
      <span>${opp.name}</span>
      <span class="card-count">${opp.cardCount} Cards</span>
    `;
        DOM.board.opponents.appendChild(av);
    });
}

init();

// Standard UNO colors and types
const COLORS = ['red', 'yellow', 'blue', 'green'];
const TYPES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
const WILD_TYPES = ['wild', 'wild4'];

export class GameEngine {
    constructor(roomId, broadcastCallback, emitEventCallback) {
        this.roomId = roomId;
        this.broadcast = broadcastCallback;
        this.emitEvent = emitEventCallback;
        this.players = [];
        this.deck = [];
        this.discardPile = [];
        this.activeColor = null;
        this.currentTurnIndex = 0;
        this.direction = 1; // 1 for clockwise, -1 for counter-clockwise
        this.status = 'WAITING'; // WAITING, PLAYING, WAITING_COLOR, FINISHED
        this.finishedRank = []; // Array of player IDs in order of finishing
        this.pendingWildPlayer = null;
        this.pendingWildCard = null;
        this.pendingSkipNext = false;
    }

    generateDeck() {
        let deck = [];
        // Colored cards
        for (let color of COLORS) {
            deck.push({ color, type: '0', value: 0 });
            for (let i = 1; i <= 9; i++) {
                deck.push({ color, type: i.toString(), value: i });
                deck.push({ color, type: i.toString(), value: i });
            }
            for (let action of ['skip', 'reverse', 'draw2']) {
                deck.push({ color, type: action, value: 20 });
                deck.push({ color, type: action, value: 20 });
            }
        }
        // Wild cards
        for (let i = 0; i < 4; i++) {
            deck.push({ color: 'black', type: 'wild', value: 50 });
            deck.push({ color: 'black', type: 'wild4', value: 50 });
        }
        // Shuffle
        this.deck = deck.sort(() => Math.random() - 0.5);
    }

    addPlayer(id, name, isAI = false) {
        if (this.status !== 'WAITING') return false;
        if (this.players.some(p => p.id === id)) return true;
        this.players.push({ id, name, hand: [], isAI });
        return true;
    }

    hasPlayer(id) {
        return this.players.some(p => p.id === id);
    }

    removePlayer(id) {
        this.players = this.players.filter(p => p.id !== id);
        if (this.status === 'PLAYING') {
            if (this.currentTurnIndex >= this.players.length) {
                this.currentTurnIndex = 0;
            }
        }
    }

    start() {
        this.generateDeck();
        this.players.forEach(p => {
            p.hand = this.deck.splice(0, 7);
        });
        // Draw first card that is not a wild action or action card if possible, to keep simple
        do {
            let firstCard = this.deck.shift();
            if (firstCard.color === 'black' || ['skip', 'reverse', 'draw2'].includes(firstCard.type)) {
                this.deck.push(firstCard);
            } else {
                this.discardPile.push(firstCard);
                this.activeColor = firstCard.color;
                break;
            }
        } while (true);

        this.currentTurnIndex = Math.floor(Math.random() * this.players.length);
        this.finishedRank = [];
        this.status = 'PLAYING';
        this.broadcast(this.roomId);
        this.checkAIMove();
    }

    getCurrentPlayer() {
        return this.players[this.currentTurnIndex]?.id;
    }

    nextTurn() {
        let attempts = 0;
        do {
            this.currentTurnIndex = (this.currentTurnIndex + this.direction + this.players.length) % this.players.length;
            attempts++;
            // Safety break if somehow all players are finished but game hasn't ended
            if (attempts > this.players.length) break;
        } while (this.players[this.currentTurnIndex].hand.length === 0);
    }

    isValidPlay(card) {
        const topCard = this.discardPile[this.discardPile.length - 1];
        if (card.color === 'black') return true;
        if (card.color === this.activeColor) return true;
        if (card.type === topCard.type) return true;
        return false;
    }

    playCard(playerId, cardIndex) {
        if (this.status !== 'PLAYING') return;
        if (playerId !== this.getCurrentPlayer()) return;

        const player = this.players.find(p => p.id === playerId);
        const card = player.hand[cardIndex];

        if (!this.isValidPlay(card)) return;

        // Remove from hand
        player.hand.splice(cardIndex, 1);
        this.discardPile.push(card);

        let skipNext = false;
        // Handle Action Cards
        if (card.type === 'skip') {
            skipNext = true;
        } else if (card.type === 'reverse') {
            this.direction *= -1;
            if (this.players.length === 2) {
                skipNext = true; // In 2-player, reverse acts like a skip
            }
        } else if (card.type === 'draw2') {
            this.nextTurn();
            this.drawCards(this.getCurrentPlayer(), 2);
            skipNext = false; // Because we already advanced turn, the drawn player is current, then we skip them by advancing again
        } else if (card.type === 'wild4') {
            this.nextTurn();
            this.drawCards(this.getCurrentPlayer(), 4);
            skipNext = false; // Same logic as draw2
        }

        if (card.color === 'black') {
            if (player.isAI) {
                this.activeColor = COLORS[Math.floor(Math.random() * COLORS.length)];
                this.finalizeTurn(player, skipNext);
            } else {
                this.status = 'WAITING_COLOR';
                this.pendingWildPlayer = player.id;
                this.pendingSkipNext = skipNext;
                this.broadcast(this.roomId);
                return; // Stop turn progression until color is chosen
            }
        } else {
            this.activeColor = card.color;
            this.finalizeTurn(player, skipNext);
        }
    }

    chooseColor(playerId, color) {
        if (this.status !== 'WAITING_COLOR') return;
        if (playerId !== this.pendingWildPlayer) return;
        if (!COLORS.includes(color)) return;

        this.activeColor = color;
        this.status = 'PLAYING';

        const player = this.players.find(p => p.id === playerId);
        this.finalizeTurn(player, this.pendingSkipNext);
    }

    finalizeTurn(player, skipNext) {
        if (player.hand.length === 0) {
            this.finishedRank.push(player.id);
            // Check if game should end (only 1 player left with cards)
            if (this.players.length - this.finishedRank.length <= 1) {
                this.status = 'FINISHED';
                // Find the last player and add them to the bottom of the rank
                const lastPlayer = this.players.find(p => p.hand.length > 0);
                if (lastPlayer) {
                    this.finishedRank.push(lastPlayer.id);
                }
            } else {
                this.nextTurn();
                if (skipNext) {
                    this.nextTurn();
                }
            }
        } else {
            this.nextTurn();
            if (skipNext) {
                this.nextTurn();
            }
        }

        this.broadcast(this.roomId);
        this.checkAIMove();
    }

    drawCard(playerId) {
        if (playerId !== this.getCurrentPlayer()) return;
        this.drawCards(playerId, 1);
        this.nextTurn();
        this.broadcast(this.roomId);
        this.checkAIMove();
    }

    drawCards(playerId, amount) {
        const player = this.players.find(p => p.id === playerId);
        for (let i = 0; i < amount; i++) {
            if (this.deck.length === 0) {
                // Reshuffle discard pile into deck, keeping top card
                const topCard = this.discardPile.pop();
                this.deck = this.discardPile.sort(() => Math.random() - 0.5);
                this.discardPile = [topCard];
            }
            if (this.deck.length > 0) {
                player.hand.push(this.deck.shift());
            }
        }
    }

    // Hide hands for other players when sending state to clients
    // The client must figure out which player is "me" using their socket.id
    getState() {
        return {
            roomId: this.roomId,
            status: this.status,
            finishedRank: this.finishedRank,
            activeColor: this.activeColor,
            topCard: this.discardPile.length > 0 ? this.discardPile[this.discardPile.length - 1] : null,
            currentPlayerIndex: this.currentTurnIndex,
            currentPlayerId: this.players[this.currentTurnIndex]?.id,
            pendingWildPlayer: this.pendingWildPlayer,
            direction: this.direction,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                isAI: p.isAI,
                cardCount: p.hand.length,
                hand: p.hand // This should ideally be redacted for opponents, but for simplicity of this implementation we'll let the client filter or just send everything and hide it on client
            }))
        };
    }

    checkAIMove() {
        if (this.status !== 'PLAYING') return;
        const currentPlayer = this.players[this.currentTurnIndex];
        if (currentPlayer && currentPlayer.isAI) {
            if (typeof this.emitEvent === 'function') {
                this.emitEvent('ai_thinking', currentPlayer.id);
            }
            setTimeout(() => {
                this.makeAIMove();
            }, 2000);
        }
    }

    makeAIMove() {
        if (this.status !== 'PLAYING') return;
        const playerId = this.getCurrentPlayer();
        const player = this.players.find(p => p.id === playerId);
        if (!player || !player.isAI) return;

        let playableIndexes = [];
        player.hand.forEach((card, index) => {
            if (this.isValidPlay(card)) playableIndexes.push(index);
        });

        if (playableIndexes.length > 0) {
            const randomIndex = playableIndexes[Math.floor(Math.random() * playableIndexes.length)];
            this.playCard(playerId, randomIndex);
        } else {
            this.drawCard(playerId);
        }
    }
}

sap.ui.define(
  [
    'sap/m/MessageBox',
    'sap/m/MessageToast',
    'sap/ui/core/mvc/Controller',
    'sap/ui/model/json/JSONModel',
  ],
  function(MessageBox, MessageToast, Controller, JSONModel) {
    'use strict';

    const WS_PORT = 8082;
    const RECONNECT_DELAY_MS = 2000;
    const MAX_RECONNECT_ATTEMPTS = 5;

    return Controller.extend('com.tic-tac-toe.controller.lobby', {
      ws: null,
      _reconnectAttempts: 0,
      _reconnectTimer: null,

      onInit: function() {
        const oModel = new JSONModel({
          playerName: '',
          connected: false,
          myId: '',
          players: [],
        });
        this.getView().setModel(oModel, 'lobby');

        // Stable handler reference so it can be add/removeEventListener'd.
        this._onWsMessage = this._handleWsMessage.bind(this);

        this.getOwnerComponent().getRouter()
          .getRoute('lobby').attachPatternMatched(this._onLobbyEntered, this);
      },

      _getWsUrl: function() {
        const loc = window.location;
        // Local dev (ui5 serve on :8081): connect straight to the standalone
        // game server on its own port.
        if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
          return `ws://${loc.hostname}:${WS_PORT}`;
        }
        // Deployed: go through the approuter "/game-server" route on the same
        // origin, so the connection is wss (on https) and XSUAA-authenticated.
        const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${loc.host}/game-server`;
      },

      _onLobbyEntered: function() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          // Re-attach the lobby listener — it is detached in _startGame while a
          // game is in progress. addEventListener is idempotent for the same
          // reference, so this is safe on the initial entry too.
          this.ws.addEventListener('message', this._onWsMessage);
          this.ws.send(JSON.stringify({ type: 'refreshList' }));
        }
      },

      _setupWebSocket: function(name, onReady) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          if (onReady) { onReady(); }
          return;
        }

        if (this.ws) {
          this.ws.close();
        }

        const oModel = this.getView().getModel('lobby');
        this._onReadyOnce = onReady || null;

        this.ws = new WebSocket(this._getWsUrl());

        this.ws.onopen = () => {
          this._reconnectAttempts = 0;
          this.ws.send(JSON.stringify({ type: 'join', name: name }));
        };

        // addEventListener (not .onmessage) so the game controller can attach
        // its own handler without clobbering the lobby's, and vice versa.
        this.ws.addEventListener('message', this._onWsMessage);

        this.ws.onclose = () => {
          oModel.setProperty('/connected', false);
          oModel.setProperty('/players', []);
          this._attemptReconnect(name);
        };

        this.ws.onerror = () => {
          MessageToast.show('Cannot connect to server');
        };
      },

      _attemptReconnect: function(name) {
        if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          MessageToast.show('Connection lost. Click Connect to retry.');
          this._enableConnectUI();
          this._reconnectAttempts = 0;
          return;
        }

        this._reconnectAttempts++;
        const delay = RECONNECT_DELAY_MS * this._reconnectAttempts;

        this._reconnectTimer = setTimeout(() => {
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this._setupWebSocket(name);
          }
        }, delay);
      },

      _enableConnectUI: function() {
        const connectBtn = this.getView().byId('connectBtn');
        const nameInput = this.getView().byId('playerNameInput');
        if (connectBtn) { connectBtn.setEnabled(true); }
        if (nameInput) { nameInput.setEnabled(true); }
      },

      _handleWsMessage: function(event) {
        try {
          this._dispatch(JSON.parse(event.data));
        } catch (e) {
          // Ignore malformed messages
        }
      },

      _dispatch: function(msg) {
        const oModel = this.getView().getModel('lobby');

        switch (msg.type) {
          case 'joined':
            oModel.setProperty('/connected', true);
            oModel.setProperty('/myId', msg.id);
            this.getView().byId('connectBtn').setEnabled(false);
            this.getView().byId('playerNameInput').setEnabled(false);
            MessageToast.show(`Connected as ${msg.name}`);
            // Fire the one-shot onReady callback (e.g. auto "playAI" after join).
            if (this._onReadyOnce) {
              const cb = this._onReadyOnce;
              this._onReadyOnce = null;
              cb();
            }
            break;

          case 'playerList':
            oModel.setProperty('/players', msg.players);
            break;

          case 'invite':
            this._handleInvite(msg);
            break;

          case 'inviteDeclined':
            MessageToast.show(`${msg.byName} declined your invite`);
            break;

          case 'gameStart':
            this._startGame(msg);
            break;

          case 'error':
            MessageToast.show(msg.message || 'Server error');
            break;

          case 'gameOver':
            // Handle timeout while in lobby
            if (msg.result === 'timeout') {
              MessageToast.show(msg.message || 'Game timed out');
            }
            break;
        }
      },

      onConnect: function() {
        const oModel = this.getView().getModel('lobby');
        const name = oModel.getProperty('/playerName').trim();

        if (!name) {
          MessageToast.show('Please enter your name');
          return;
        }

        this._setupWebSocket(name);
      },

      _handleInvite: function(msg) {
        MessageBox.confirm(`${msg.fromName} wants to play. Accept?`, {
          title: 'Game Invite',
          onClose: (action) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { return; }
            const type = action === MessageBox.Action.OK ? 'acceptInvite' : 'declineInvite';
            this.ws.send(JSON.stringify({ type: type, fromId: msg.fromId }));
          },
        });
      },

      _startGame: function(msg) {
        // Hand the socket to the game controller: detach the lobby listener so
        // only the game view handles messages while playing.
        this.ws.removeEventListener('message', this._onWsMessage);
        const oComponent = this.getOwnerComponent();
        oComponent._gameData = {
          ws: this.ws,
          gameId: msg.gameId,
          mySymbol: msg.symbol,
          opponentName: msg.opponent,
          cols: msg.cols,
          rows: msg.rows,
        };
        oComponent.getRouter().navTo('game');
      },

      onPlayComputer: function() {
        const oModel = this.getView().getModel('lobby');
        const difficulty = this.getView().byId('difficultySelect').getSelectedKey();

        const sendPlayAI = () => {
          this.ws.send(JSON.stringify({ type: 'playAI', difficulty: difficulty }));
        };

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          const name = oModel.getProperty('/playerName').trim() || 'Player';
          oModel.setProperty('/playerName', name);
          this._setupWebSocket(name, sendPlayAI);
        } else {
          sendPlayAI();
        }
      },

      onInvite: function(oEvent) {
        const oContext = oEvent.getSource().getBindingContext('lobby');
        const targetId = oContext.getProperty('id');
        const myId = this.getView().getModel('lobby').getProperty('/myId');

        if (targetId === myId) { return; }
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { return; }

        this.ws.send(JSON.stringify({ type: 'invite', targetId: targetId }));
        MessageToast.show('Invite sent!');
      },

      onExit: function() {
        if (this._reconnectTimer) {
          clearTimeout(this._reconnectTimer);
        }
        if (this.ws) {
          this.ws.close();
        }
      },
    });
  }
);

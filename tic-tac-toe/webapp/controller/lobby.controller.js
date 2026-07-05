sap.ui.define(
  [
    'sap/m/MessageBox',
    'sap/m/MessageToast',
    'com/tic-tac-toe/controller/BaseController',
    'sap/ui/model/json/JSONModel',
  ],
  function(MessageBox, MessageToast, BaseController, JSONModel) {
    'use strict';

    const RECONNECT_DELAY_MS = 2000;
    const MAX_RECONNECT_ATTEMPTS = 5;

    return BaseController.extend('com.tic-tac-toe.controller.lobby', {
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

        this.getRouter().getRoute('lobby').attachPatternMatched(this._onLobbyEntered, this);
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

        this.ws = new WebSocket(this.getWsUrl());

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
          MessageToast.show(this._text('cannotConnect'));
        };
      },

      _attemptReconnect: function(name) {
        if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          MessageToast.show(this._text('connectionLostRetry'));
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
            MessageToast.show(this._text('connectedAs', [msg.name]));
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
            MessageToast.show(this._text('inviteDeclined', [msg.byName]));
            break;

          case 'gameStart':
            this._startGame(msg);
            break;

          case 'error':
            MessageToast.show(msg.message || this._text('serverError'));
            break;

          case 'gameOver':
            // Handle timeout while in lobby
            if (msg.result === 'timeout') {
              MessageToast.show(msg.message || this._text('gameTimedOut'));
            }
            break;
        }
      },

      onConnect: function() {
        const oModel = this.getView().getModel('lobby');
        const name = oModel.getProperty('/playerName').trim();

        if (!name) {
          MessageToast.show(this._text('enterNameFirst'));
          return;
        }

        this._setupWebSocket(name);
      },

      _handleInvite: function(msg) {
        MessageBox.confirm(this._text('inviteConfirm', [msg.fromName]), {
          title: this._text('gameInviteTitle'),
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
        MessageToast.show(this._text('inviteSent'));
      },

      onOpenAdmin: function() {
        this.getRouter().navTo('admin');
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

sap.ui.define(
  [
    'sap/m/MessageBox',
    'sap/m/MessageToast',
    'sap/ui/core/mvc/Controller',
    'sap/ui/model/json/JSONModel',
  ],
  function(MessageBox, MessageToast, Controller, JSONModel) {
    'use strict';

    var WS_PORT = 8082;
    var RECONNECT_DELAY_MS = 2000;
    var MAX_RECONNECT_ATTEMPTS = 5;

    return Controller.extend('com.tic-tac-toe.controller.lobby', {
      ws: null,
      _reconnectAttempts: 0,
      _reconnectTimer: null,
      _pendingAIDifficulty: null,

      onInit: function() {
        var oModel = new JSONModel({
          playerName: '',
          connected: false,
          myId: '',
          players: [],
        });
        this.getView().setModel(oModel, 'lobby');

        var oRouter = this.getOwnerComponent().getRouter();
        oRouter.getRoute('lobby').attachPatternMatched(this._onLobbyEntered, this);
      },

      _getWsUrl: function() {
        return 'ws://' + window.location.hostname + ':' + WS_PORT;
      },

      _onLobbyEntered: function() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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

        var that = this;
        var oModel = this.getView().getModel('lobby');

        this.ws = new WebSocket(this._getWsUrl());

        this.ws.onopen = function() {
          that._reconnectAttempts = 0;
          that.ws.send(JSON.stringify({ type: 'join', name: name }));
        };

        this.ws.onmessage = function(event) {
          try {
            var msg = JSON.parse(event.data);
            that._dispatch(msg, onReady);
          } catch (e) {
            // Ignore malformed messages
          }
        };

        this.ws.onclose = function() {
          oModel.setProperty('/connected', false);
          oModel.setProperty('/players', []);
          that._attemptReconnect(name);
        };

        this.ws.onerror = function() {
          MessageToast.show('Cannot connect to server');
        };
      },

      _attemptReconnect: function(name) {
        var that = this;

        if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          MessageToast.show('Connection lost. Click Connect to retry.');
          this._enableConnectUI();
          this._reconnectAttempts = 0;
          return;
        }

        this._reconnectAttempts++;
        var delay = RECONNECT_DELAY_MS * this._reconnectAttempts;

        this._reconnectTimer = setTimeout(function() {
          if (!that.ws || that.ws.readyState !== WebSocket.OPEN) {
            that._setupWebSocket(name);
          }
        }, delay);
      },

      _enableConnectUI: function() {
        var connectBtn = this.getView().byId('connectBtn');
        var nameInput = this.getView().byId('playerNameInput');
        if (connectBtn) { connectBtn.setEnabled(true); }
        if (nameInput) { nameInput.setEnabled(true); }
      },

      _dispatch: function(msg, onReadyCallback) {
        var oModel = this.getView().getModel('lobby');

        switch (msg.type) {
          case 'joined':
            oModel.setProperty('/connected', true);
            oModel.setProperty('/myId', msg.id);
            this.getView().byId('connectBtn').setEnabled(false);
            this.getView().byId('playerNameInput').setEnabled(false);
            MessageToast.show('Connected as ' + msg.name);
            if (onReadyCallback) { onReadyCallback(); }
            break;

          case 'playerList':
            oModel.setProperty('/players', msg.players);
            break;

          case 'invite':
            this._handleInvite(msg);
            break;

          case 'inviteDeclined':
            MessageToast.show(msg.byName + ' declined your invite');
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
        var oModel = this.getView().getModel('lobby');
        var name = oModel.getProperty('/playerName').trim();

        if (!name) {
          MessageToast.show('Please enter your name');
          return;
        }

        this._setupWebSocket(name);
      },

      _handleInvite: function(msg) {
        var that = this;
        MessageBox.confirm(msg.fromName + ' wants to play. Accept?', {
          title: 'Game Invite',
          onClose: function(action) {
            if (!that.ws || that.ws.readyState !== WebSocket.OPEN) { return; }
            if (action === MessageBox.Action.OK) {
              that.ws.send(JSON.stringify({ type: 'acceptInvite', fromId: msg.fromId }));
            } else {
              that.ws.send(JSON.stringify({ type: 'declineInvite', fromId: msg.fromId }));
            }
          },
        });
      },

      _startGame: function(msg) {
        var oComponent = this.getOwnerComponent();
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
        var oModel = this.getView().getModel('lobby');
        var difficulty = this.getView().byId('difficultySelect').getSelectedKey();

        var that = this;
        var sendPlayAI = function() {
          that.ws.send(JSON.stringify({ type: 'playAI', difficulty: difficulty }));
        };

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          var name = oModel.getProperty('/playerName').trim() || 'Player';
          oModel.setProperty('/playerName', name);
          this._setupWebSocket(name, sendPlayAI);
        } else {
          sendPlayAI();
        }
      },

      onInvite: function(oEvent) {
        var oContext = oEvent.getSource().getBindingContext('lobby');
        var targetId = oContext.getProperty('id');
        var oModel = this.getView().getModel('lobby');
        var myId = oModel.getProperty('/myId');

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

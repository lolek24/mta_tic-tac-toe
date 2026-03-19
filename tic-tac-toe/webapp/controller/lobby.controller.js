sap.ui.define(
  [
    'sap/m/MessageBox',
    'sap/m/MessageToast',
    'sap/ui/core/mvc/Controller',
    'sap/ui/model/json/JSONModel',
  ],
  function(MessageBox, MessageToast, Controller, JSONModel) {
    'use strict';

    return Controller.extend('com.tic-tac-toe.controller.lobby', {
      ws: null,

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

      _onLobbyEntered: function() {
        // When returning from game, restore WebSocket message handler
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          var that = this;
          this.ws.onmessage = function(event) {
            var msg = JSON.parse(event.data);
            that._handleMessage(msg);
          };
          // Request fresh player list
          this.ws.send(JSON.stringify({ type: 'refreshList' }));
        }
      },

      onConnect: function() {
        var oModel = this.getView().getModel('lobby');
        var name = oModel.getProperty('/playerName').trim();

        if (!name) {
          MessageToast.show('Please enter your name');
          return;
        }

        if (this.ws) {
          this.ws.close();
        }

        var that = this;
        var wsUrl = 'ws://' + window.location.hostname + ':8082';
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = function() {
          that.ws.send(JSON.stringify({ type: 'join', name: name }));
        };

        this.ws.onmessage = function(event) {
          var msg = JSON.parse(event.data);
          that._handleMessage(msg);
        };

        this.ws.onclose = function() {
          oModel.setProperty('/connected', false);
          oModel.setProperty('/players', []);
          MessageToast.show('Disconnected from server');
        };

        this.ws.onerror = function() {
          MessageToast.show('Cannot connect to server');
        };
      },

      _handleMessage: function(msg) {
        var oModel = this.getView().getModel('lobby');

        switch (msg.type) {
          case 'joined':
            oModel.setProperty('/connected', true);
            oModel.setProperty('/myId', msg.id);
            this.getView().byId('connectBtn').setEnabled(false);
            this.getView().byId('playerNameInput').setEnabled(false);
            MessageToast.show('Connected as ' + msg.name);
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
        }
      },

      _handleInvite: function(msg) {
        var that = this;
        MessageBox.confirm(msg.fromName + ' wants to play. Accept?', {
          title: 'Game Invite',
          onClose: function(action) {
            if (action === MessageBox.Action.OK) {
              that.ws.send(JSON.stringify({
                type: 'acceptInvite',
                fromId: msg.fromId,
              }));
            } else {
              that.ws.send(JSON.stringify({
                type: 'declineInvite',
                fromId: msg.fromId,
              }));
            }
          },
        });
      },

      _startGame: function(msg) {
        // Store game info on Component so the game controller can access it
        var oComponent = this.getOwnerComponent();
        oComponent._gameData = {
          ws: this.ws,
          gameId: msg.gameId,
          mySymbol: msg.symbol,
          opponentName: msg.opponent,
          cols: msg.cols,
          rows: msg.rows,
        };

        // Navigate to game view
        oComponent.getRouter().navTo('game');
      },

      onPlayComputer: function() {
        var difficulty = this.getView().byId('difficultySelect').getSelectedKey();
        var oComponent = this.getOwnerComponent();

        oComponent._gameData = {
          ws: null,
          gameId: 'local',
          mySymbol: 'O',
          opponentName: 'Computer (' + difficulty + ')',
          cols: 3,
          rows: 3,
          isAI: true,
          difficulty: difficulty,
        };

        oComponent.getRouter().navTo('game');
      },

      onInvite: function(oEvent) {
        var oContext = oEvent.getSource().getBindingContext('lobby');
        var targetId = oContext.getProperty('id');
        var oModel = this.getView().getModel('lobby');
        var myId = oModel.getProperty('/myId');

        if (targetId === myId) {
          return;
        }

        this.ws.send(JSON.stringify({
          type: 'invite',
          targetId: targetId,
        }));

        MessageToast.show('Invite sent!');
      },

      onExit: function() {
        if (this.ws) {
          this.ws.close();
        }
      },
    });
  }
);

sap.ui.define(
  [
    'sap/m/MessageToast',
    'sap/m/MessageBox',
    'sap/ui/core/mvc/Controller',
    'sap/ui/model/json/JSONModel',
    'com/tic-tac-toe/custom/ui/containers/customControl',
  ],
  function(MessageToast, MessageBox, Controller, JSONModel, customControl) {
    'use strict';

    var CELL_SIZE_PX = 120;

    return Controller.extend('com.tic-tac-toe.controller.main', {
      _board: [],
      _gameover: false,
      _ws: null,
      _gameId: null,
      _mySymbol: null,
      _boundDispatch: null,

      onInit: function() {
        var oGameModel = new JSONModel({
          mySymbol: '',
          opponentSymbol: '',
          myName: '',
          opponentName: '',
          myTurn: false,
        });
        this.getView().setModel(oGameModel, 'game');

        this._boundDispatch = this._dispatch.bind(this);

        var oRouter = this.getOwnerComponent().getRouter();
        oRouter.getRoute('game').attachPatternMatched(this._onGameEntered, this);
      },

      _onGameEntered: function() {
        var oComponent = this.getOwnerComponent();
        var gameData = oComponent._gameData;

        if (!gameData) {
          oComponent.getRouter().navTo('lobby');
          return;
        }

        this._ws = gameData.ws;
        this._gameId = gameData.gameId;
        this._mySymbol = gameData.mySymbol;

        var oModel = this.getView().getModel('game');
        oModel.setProperty('/mySymbol', gameData.mySymbol);
        oModel.setProperty('/opponentSymbol', gameData.mySymbol === 'O' ? 'X' : 'O');
        oModel.setProperty('/opponentName', gameData.opponentName);
        oModel.setProperty('/myName', 'You');
        oModel.setProperty('/myTurn', gameData.mySymbol === 'O');

        this._buildBoard(gameData.cols, gameData.rows);

        // Attach message handler
        if (this._ws) {
          this._ws.onmessage = this._boundDispatch;
        }
      },

      _dispatch: function(event) {
        var msg;
        try { msg = JSON.parse(event.data); } catch (e) { return; }

        var oModel = this.getView().getModel('game');

        switch (msg.type) {
          case 'moveMade':
            this._placeSymbol(msg.index, msg.symbol);
            oModel.setProperty('/myTurn', msg.symbol !== this._mySymbol);
            break;

          case 'gameOver':
            this._gameover = true;
            oModel.setProperty('/myTurn', false);
            if (msg.result === 'win') {
              if (msg.symbol === this._mySymbol) {
                MessageBox.success('You win!', { title: 'Game Over' });
              } else {
                MessageBox.error(msg.winner + ' wins!', { title: 'Game Over' });
              }
            } else if (msg.result === 'timeout') {
              var that = this;
              MessageBox.warning(msg.message || 'Game timed out', {
                title: 'Timeout',
                onClose: function() { that._goBackToLobby(); },
              });
            } else {
              MessageBox.information("It's a draw!", { title: 'Game Over' });
            }
            break;

          case 'opponentLeft':
            this._gameover = true;
            oModel.setProperty('/myTurn', false);
            var self = this;
            MessageBox.warning('Opponent left the game', {
              title: 'Game Over',
              onClose: function() { self._goBackToLobby(); },
            });
            break;

          case 'error':
            MessageToast.show(msg.message || 'Server error');
            break;

          case 'playerList':
            // Ignored in game view
            break;
        }
      },

      _buildBoard: function(cols, rows) {
        var total = cols * rows;

        this._board = [];
        this._gameover = false;

        for (var i = 0; i < total; i++) {
          this._board.push('');
        }

        var oBoard = this.getView().byId('board');
        oBoard.setGridTemplateColumns('repeat(' + cols + ', ' + CELL_SIZE_PX + 'px)');
        oBoard.setGridTemplateRows('repeat(' + rows + ', ' + CELL_SIZE_PX + 'px)');
        oBoard.removeAllItems();

        for (var j = 0; j < total; j++) {
          var item = new customControl({
            press: this._onCellPress.bind(this, j),
          });
          oBoard.addItem(item);
        }
      },

      _placeSymbol: function(index, symbol) {
        this._board[index] = symbol;
        var oBoard = this.getView().byId('board');
        var cell = oBoard.getItems()[index];
        cell.placeSymbol(symbol);
      },

      _onCellPress: function(index) {
        if (this._gameover) { return; }

        var oModel = this.getView().getModel('game');
        if (!oModel.getProperty('/myTurn')) {
          MessageToast.show("It's not your turn");
          return;
        }

        if (this._board[index] !== '') { return; }

        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
          MessageToast.show('Connection lost');
          return;
        }

        this._ws.send(JSON.stringify({
          type: 'move',
          gameId: this._gameId,
          index: index,
        }));
      },

      _goBackToLobby: function() {
        var oComponent = this.getOwnerComponent();
        oComponent._gameData = null;
        oComponent.getRouter().navTo('lobby');
      },

      onLeaveGame: function() {
        var that = this;
        MessageBox.confirm('Are you sure you want to leave?', {
          title: 'Leave Game',
          onClose: function(action) {
            if (action === MessageBox.Action.OK) {
              if (that._ws && that._ws.readyState === WebSocket.OPEN) {
                that._ws.send(JSON.stringify({
                  type: 'leaveGame',
                  gameId: that._gameId,
                }));
              }
              that._goBackToLobby();
            }
          },
        });
      },

      onNavBack: function() {
        this.onLeaveGame();
      },
    });
  }
);

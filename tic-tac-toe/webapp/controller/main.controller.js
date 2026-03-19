sap.ui.define(
  [
    'sap/m/MessageToast',
    'sap/m/MessageBox',
    'sap/ui/core/mvc/Controller',
    'sap/ui/model/json/JSONModel',
    'com/tic-tac-toe/custom/ui/containers/customControl',
    'com/tic-tac-toe/model/MonteCarloAI',
  ],
  function(MessageToast, MessageBox, Controller, JSONModel, customControl, MonteCarloAI) {
    'use strict';

    return Controller.extend('com.tic-tac-toe.controller.main', {
      board: [],
      gameover: false,
      ws: null,
      gameId: null,
      mySymbol: null,
      isAI: false,
      aiDifficulty: 'medium',
      cols: 3,
      rows: 3,

      onInit: function() {
        var oGameModel = new JSONModel({
          mySymbol: '',
          opponentSymbol: '',
          myName: '',
          opponentName: '',
          myTurn: false,
        });
        this.getView().setModel(oGameModel, 'game');

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

        this.ws = gameData.ws;
        this.gameId = gameData.gameId;
        this.mySymbol = gameData.mySymbol;
        this.isAI = !!gameData.isAI;
        this.aiDifficulty = gameData.difficulty || 'medium';
        this.cols = gameData.cols;
        this.rows = gameData.rows;

        var oModel = this.getView().getModel('game');
        oModel.setProperty('/mySymbol', gameData.mySymbol);
        oModel.setProperty('/opponentSymbol', gameData.mySymbol === 'O' ? 'X' : 'O');
        oModel.setProperty('/opponentName', gameData.opponentName);
        oModel.setProperty('/myName', 'You');
        oModel.setProperty('/myTurn', gameData.mySymbol === 'O');

        this._buildBoard(gameData.cols, gameData.rows);

        if (!this.isAI && this.ws) {
          var that = this;
          this._originalOnMessage = this.ws.onmessage;
          this.ws.onmessage = function(event) {
            var msg = JSON.parse(event.data);
            that._handleMessage(msg);
          };
        }
      },

      _handleMessage: function(msg) {
        var oModel = this.getView().getModel('game');

        switch (msg.type) {
          case 'moveMade':
            this._placeSymbol(msg.index, msg.symbol);
            oModel.setProperty('/myTurn', msg.symbol !== this.mySymbol);
            break;

          case 'gameOver':
            this.gameover = true;
            oModel.setProperty('/myTurn', false);
            if (msg.result === 'win') {
              var isWinner = msg.symbol === this.mySymbol;
              if (isWinner) {
                MessageBox.success('You win!', { title: 'Game Over' });
              } else {
                MessageBox.error(msg.winner + ' wins!', { title: 'Game Over' });
              }
            } else {
              MessageBox.information("It's a draw!", { title: 'Game Over' });
            }
            break;

          case 'opponentLeft':
            this.gameover = true;
            oModel.setProperty('/myTurn', false);
            var that = this;
            MessageBox.warning('Opponent left the game', {
              title: 'Game Over',
              onClose: function() {
                that._goBackToLobby();
              },
            });
            break;

          case 'playerList':
            break;
        }
      },

      _buildBoard: function(cols, rows) {
        var total = cols * rows;

        this.board = [];
        this.gameover = false;

        for (var i = 0; i < total; i++) {
          this.board.push('');
        }

        this.winningSequences = this._generateWinSequences(cols, rows);

        var oBoard = this.getView().byId('board');
        oBoard.setGridTemplateColumns('repeat(' + cols + ', 120px)');
        oBoard.setGridTemplateRows('repeat(' + rows + ', 120px)');
        oBoard.removeAllItems();

        for (var j = 0; j < total; j++) {
          var item = new customControl({
            press: this._onCellPress.bind(this, j),
          });
          oBoard.addItem(item);
        }
      },

      _generateWinSequences: function(cols, rows) {
        var sequences = [];
        for (var r = 0; r < rows; r++) {
          var row = [];
          for (var c = 0; c < cols; c++) { row.push(r * cols + c); }
          sequences.push(row);
        }
        for (var c2 = 0; c2 < cols; c2++) {
          var col = [];
          for (var r2 = 0; r2 < rows; r2++) { col.push(r2 * cols + c2); }
          sequences.push(col);
        }
        if (cols === rows) {
          var d1 = [], d2 = [];
          for (var d = 0; d < cols; d++) {
            d1.push(d * cols + d);
            d2.push(d * cols + (cols - 1 - d));
          }
          sequences.push(d1);
          sequences.push(d2);
        }
        return sequences;
      },

      _checkWin: function(symbol) {
        var board = this.board;
        return this.winningSequences.some(function(seq) {
          return seq.every(function(idx) { return board[idx] === symbol; });
        });
      },

      _checkDraw: function() {
        return this.board.every(function(cell) { return cell !== ''; });
      },

      _placeSymbol: function(index, symbol) {
        this.board[index] = symbol;
        var oBoard = this.getView().byId('board');
        var cell = oBoard.getItems()[index];
        cell.placeSymbol(symbol);
      },

      _onCellPress: function(index) {
        if (this.gameover) {
          return;
        }

        var oModel = this.getView().getModel('game');
        if (!oModel.getProperty('/myTurn')) {
          MessageToast.show("It's not your turn");
          return;
        }

        if (this.board[index] !== '') {
          return;
        }

        if (this.isAI) {
          this._handleAIGame(index);
        } else {
          this.ws.send(JSON.stringify({
            type: 'move',
            gameId: this.gameId,
            index: index,
          }));
        }
      },

      _handleAIGame: function(index) {
        var oModel = this.getView().getModel('game');

        // Player move
        this._placeSymbol(index, this.mySymbol);

        if (this._checkWin(this.mySymbol)) {
          this.gameover = true;
          oModel.setProperty('/myTurn', false);
          MessageBox.success('You win!', { title: 'Game Over' });
          return;
        }

        if (this._checkDraw()) {
          this.gameover = true;
          oModel.setProperty('/myTurn', false);
          MessageBox.information("It's a draw!", { title: 'Game Over' });
          return;
        }

        // AI's turn
        oModel.setProperty('/myTurn', false);

        var that = this;
        var aiSymbol = this.mySymbol === 'O' ? 'X' : 'O';

        // Use setTimeout to let UI update before AI computation
        setTimeout(function() {
          var aiMove = MonteCarloAI.findBestMove(
            that.board, aiSymbol, that.cols, that.rows, that.aiDifficulty
          );

          if (aiMove === -1) {
            return;
          }

          that._placeSymbol(aiMove, aiSymbol);

          if (that._checkWin(aiSymbol)) {
            that.gameover = true;
            MessageBox.error('Computer wins!', { title: 'Game Over' });
            return;
          }

          if (that._checkDraw()) {
            that.gameover = true;
            MessageBox.information("It's a draw!", { title: 'Game Over' });
            return;
          }

          oModel.setProperty('/myTurn', true);
        }, 300);
      },

      _goBackToLobby: function() {
        var oComponent = this.getOwnerComponent();
        if (this.ws && this._originalOnMessage) {
          this.ws.onmessage = this._originalOnMessage;
        }
        oComponent._gameData = null;
        oComponent.getRouter().navTo('lobby');
      },

      onLeaveGame: function() {
        var that = this;

        if (this.isAI) {
          this._goBackToLobby();
          return;
        }

        MessageBox.confirm('Are you sure you want to leave?', {
          title: 'Leave Game',
          onClose: function(action) {
            if (action === MessageBox.Action.OK) {
              that.ws.send(JSON.stringify({
                type: 'leaveGame',
                gameId: that.gameId,
              }));
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

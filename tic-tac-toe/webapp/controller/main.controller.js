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

    const CELL_SIZE_PX = 120;

    return Controller.extend('com.tic-tac-toe.controller.main', {
      _board: [],
      _gameover: false,
      _ws: null,
      _gameId: null,
      _mySymbol: null,
      _boundDispatch: null,

      onInit: function() {
        const oGameModel = new JSONModel({
          mySymbol: '',
          opponentSymbol: '',
          myName: '',
          opponentName: '',
          myTurn: false,
        });
        this.getView().setModel(oGameModel, 'game');

        this._boundDispatch = this._dispatch.bind(this);

        this.getOwnerComponent().getRouter()
          .getRoute('game').attachPatternMatched(this._onGameEntered, this);
      },

      _onGameEntered: function() {
        const oComponent = this.getOwnerComponent();
        const gameData = oComponent._gameData;

        if (!gameData) {
          oComponent.getRouter().navTo('lobby');
          return;
        }

        this._ws = gameData.ws;
        this._gameId = gameData.gameId;
        this._mySymbol = gameData.mySymbol;

        const oModel = this.getView().getModel('game');
        oModel.setProperty('/mySymbol', gameData.mySymbol);
        oModel.setProperty('/opponentSymbol', gameData.mySymbol === 'O' ? 'X' : 'O');
        oModel.setProperty('/opponentName', gameData.opponentName);
        oModel.setProperty('/myName', 'You');
        oModel.setProperty('/myTurn', gameData.mySymbol === 'O');

        this._buildBoard(gameData.cols, gameData.rows);

        // Attach the game's message handler alongside (not over) the lobby's.
        // The lobby detaches its own listener in _startGame, so exactly one is
        // active at a time.
        if (this._ws) {
          this._ws.addEventListener('message', this._boundDispatch);
        }
      },

      _dispatch: function(event) {
        let msg;
        try { msg = JSON.parse(event.data); } catch (e) { return; }

        const oModel = this.getView().getModel('game');

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
                MessageBox.error(`${msg.winner} wins!`, { title: 'Game Over' });
              }
            } else if (msg.result === 'timeout') {
              MessageBox.warning(msg.message || 'Game timed out', {
                title: 'Timeout',
                onClose: () => this._goBackToLobby(),
              });
            } else {
              MessageBox.information("It's a draw!", { title: 'Game Over' });
            }
            break;

          case 'opponentLeft':
            this._gameover = true;
            oModel.setProperty('/myTurn', false);
            MessageBox.warning('Opponent left the game', {
              title: 'Game Over',
              onClose: () => this._goBackToLobby(),
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
        const total = cols * rows;

        this._board = [];
        this._gameover = false;

        for (let i = 0; i < total; i++) {
          this._board.push('');
        }

        const oBoard = this.getView().byId('board');
        oBoard.setGridTemplateColumns(`repeat(${cols}, ${CELL_SIZE_PX}px)`);
        oBoard.setGridTemplateRows(`repeat(${rows}, ${CELL_SIZE_PX}px)`);
        oBoard.removeAllItems();

        for (let j = 0; j < total; j++) {
          oBoard.addItem(new customControl({
            press: this._onCellPress.bind(this, j),
          }));
        }
      },

      _placeSymbol: function(index, symbol) {
        this._board[index] = symbol;
        const oBoard = this.getView().byId('board');
        oBoard.getItems()[index].placeSymbol(symbol);
      },

      _onCellPress: function(index) {
        if (this._gameover) { return; }

        const oModel = this.getView().getModel('game');
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
        // Release the socket: detach the game listener so the lobby (which
        // re-attaches its own on entry) becomes the sole message handler again.
        if (this._ws) {
          this._ws.removeEventListener('message', this._boundDispatch);
        }
        const oComponent = this.getOwnerComponent();
        oComponent._gameData = null;
        oComponent.getRouter().navTo('lobby');
      },

      onExit: function() {
        if (this._ws) {
          this._ws.removeEventListener('message', this._boundDispatch);
        }
      },

      onLeaveGame: function() {
        MessageBox.confirm('Are you sure you want to leave?', {
          title: 'Leave Game',
          onClose: (action) => {
            if (action === MessageBox.Action.OK) {
              if (this._ws && this._ws.readyState === WebSocket.OPEN) {
                this._ws.send(JSON.stringify({
                  type: 'leaveGame',
                  gameId: this._gameId,
                }));
              }
              this._goBackToLobby();
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

sap.ui.define(
  [
    'sap/m/MessageToast',
    'sap/m/MessageBox',
    'com/tic-tac-toe/controller/BaseController',
    'sap/ui/model/json/JSONModel',
  ],
  function(MessageToast, MessageBox, BaseController, JSONModel) {
    'use strict';

    const CELL_SIZE_PX = 120;

    return BaseController.extend('com.tic-tac-toe.controller.main', {
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
          cells: [],
        });
        this.getView().setModel(oGameModel, 'game');

        this._boundDispatch = this._dispatch.bind(this);

        this.getRouter().getRoute('game').attachPatternMatched(this._onGameEntered, this);
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
        oModel.setProperty('/myName', this._text('you'));
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
            oModel.setProperty(`/cells/${msg.index}/symbol`, msg.symbol);
            oModel.setProperty('/myTurn', msg.symbol !== this._mySymbol);
            break;

          case 'gameOver':
            this._gameover = true;
            oModel.setProperty('/myTurn', false);
            if (msg.result === 'win') {
              if (msg.symbol === this._mySymbol) {
                MessageBox.success(this._text('youWin'), { title: this._text('gameOverTitle') });
              } else {
                MessageBox.error(this._text('opponentWins', [msg.winner]), { title: this._text('gameOverTitle') });
              }
            } else if (msg.result === 'timeout') {
              MessageBox.warning(msg.message || this._text('gameTimedOut'), {
                title: this._text('timeoutTitle'),
                onClose: () => this._goBackToLobby(),
              });
            } else {
              MessageBox.information(this._text('draw'), { title: this._text('gameOverTitle') });
            }
            break;

          case 'opponentLeft':
            this._gameover = true;
            oModel.setProperty('/myTurn', false);
            MessageBox.warning(this._text('opponentLeft'), {
              title: this._text('gameOverTitle'),
              onClose: () => this._goBackToLobby(),
            });
            break;

          case 'error':
            MessageToast.show(msg.message || this._text('serverError'));
            break;

          case 'playerList':
            // Ignored in game view
            break;
        }
      },

      // Populate the board model (bound to the CSSGrid items) and size the grid.
      _buildBoard: function(cols, rows) {
        const total = cols * rows;
        this._gameover = false;

        const aCells = [];
        for (let i = 0; i < total; i++) {
          aCells.push({ index: i, symbol: '', label: this._text('cellLabel', [String(i + 1)]) });
        }
        this.getView().getModel('game').setProperty('/cells', aCells);

        const oBoard = this.getView().byId('board');
        oBoard.setGridTemplateColumns(`repeat(${cols}, ${CELL_SIZE_PX}px)`);
        oBoard.setGridTemplateRows(`repeat(${rows}, ${CELL_SIZE_PX}px)`);
      },

      onCellPress: function(oEvent) {
        if (this._gameover) { return; }

        const oModel = this.getView().getModel('game');
        if (!oModel.getProperty('/myTurn')) {
          MessageToast.show(this._text('notYourTurn'));
          return;
        }

        const iIndex = oEvent.getSource().getBindingContext('game').getProperty('index');
        if (oModel.getProperty(`/cells/${iIndex}/symbol`) !== '') { return; }

        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
          MessageToast.show(this._text('connectionLost'));
          return;
        }

        this._ws.send(JSON.stringify({
          type: 'move',
          gameId: this._gameId,
          index: iIndex,
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
        MessageBox.confirm(this._text('leaveGameConfirm'), {
          title: this._text('leaveGame'),
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

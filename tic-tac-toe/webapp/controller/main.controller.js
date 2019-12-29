sap.ui.define(
  [
    'sap/m/MessageToast',
    'sap/ui/core/mvc/Controller',
    'sap/ui/model/json/JSONModel',
    'com/tic-tac-toe/custom/ui/containers/customControl',
  ],
  function(MessageToast, Controller, JSONModel, customControl) {
    'use strict';

    return Controller.extend('com.tic-tac-toe.controller.main', {
      boardConfig: [3, 3],
      //board: ['', '', '', '', '', '', '', '', ''],
      symbols: {
        options: ['O', 'X'],
        turn_index: 0,
        change() {
          this.turn_index = this.turn_index === 0 ? 1 : 0;
        },
      },
      container_element: null,
      gameover: false,
      winning_sequences: [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6],
      ],

      onInit: function() {
        var aBoardConfig = {
          boardConfig: {
            wValue: 3,
            hValue: 3,
            boardArr: [],
          },
        };

        var range = aBoardConfig.boardConfig.hValue * aBoardConfig.boardConfig.wValue;
        for (var i = 0; i < range; i++) {
          aBoardConfig.boardConfig.boardArr.push(i);
        }
        
        var oModel = new JSONModel(aBoardConfig);
        this.getView().setModel(oModel, 'board');
        this.drawBoard();
        var oGuid = new sap.ui.model.odata.type.Guid();
        //var el = sap.ui.getCore().byId("board");
        //this.container_element = container;
      },
      onBeforeRendering: function() {
        //var el = sap.ui.getCore().byId("board");
      },
      onPress: function() {
        MessageToast.show('Hello UI5!');
        this.byId('app').to(this.byId('intro'));
      },
      onButtonClick: function(oEvent) {
        this.restart();
        MessageToast.show('Hello UI5!');
        this.byId('app').to(this.byId('intro'));
      },
      changeView: function() {
        MessageToast.show('Hello UI5!');
      },
      onAfterRendering: function() {
        var x1 = this.getView().byId('x1');

        //el.addEventListener("click", onPress, false);
      },
      onSliderEvent: function(oControlEvent) {
        var item = new customControl('new1', {
          press: 'onPress',
          icon: 'sap-icon://decline',
        });
        var board = this.getView().byId('board');
        board.addItem(item);

        
      },
      statusSet: function(Status) {
        if (Status === '0') {
          return 'sap-icon://status-error';
        }
        if (Status === '1') {
          return 'sap-icon://status-positive';
        }
        if (Status === '2') {
          return 'sap-icon://status-critical';
        }
      },

      start: function() {
        this.board.fill('');
        //this.draw();
        this.gameover = false;
      },

      restart: function() {
        this.start();
      },

      drawBoard: function() {
        
        var oBoard = this.getView().byId('board');
        var mBoard = this.getView().getModel('board');

        for (var i = 0; i < mBoard.oData.boardConfig.boardArr.length; i++) {
        var newf = "new" + i;

        var item = new customControl(newf, {
          press: 'onPress',
          icon: 'sap-icon://decline',
        });
        
        oBoard.addItem(item);
        }
        
      },
    });
  }
);

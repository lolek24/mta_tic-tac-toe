sap.ui.define(
  [
    'sap/m/MessageToast',
    'sap/m/MessageBox',
    'com/tic-tac-toe/controller/BaseController',
    'sap/ui/model/json/JSONModel',
  ],
  function(MessageToast, MessageBox, BaseController, JSONModel) {
    'use strict';

    return BaseController.extend('com.tic-tac-toe.controller.admin', {
      _ws: null,

      onInit: function() {
        const oModel = new JSONModel({
          connected: false,
          granted: false,
          denied: false,
          token: '',
          uptime: '',
          counts: { playersOnline: 0, gamesActive: 0, aiGames: 0, pvpGames: 0 },
          aiMemory: { positions: 0, totalVisits: 0 },
          players: [],
          games: [],
        });
        this.getView().setModel(oModel, 'admin');
      },

      onConnect: function() {
        const oModel = this.getView().getModel('admin');
        const sToken = oModel.getProperty('/token');

        this._closeWs();
        this._ws = new WebSocket(this.getWsUrl());

        this._ws.onopen = () => {
          oModel.setProperty('/connected', true);
          oModel.setProperty('/denied', false);
          this._ws.send(JSON.stringify({ type: 'adminSubscribe', token: sToken }));
        };
        this._ws.onmessage = (event) => {
          let msg;
          try { msg = JSON.parse(event.data); } catch (e) { return; }
          this._dispatch(msg);
        };
        this._ws.onclose = () => {
          oModel.setProperty('/connected', false);
          oModel.setProperty('/granted', false);
        };
        this._ws.onerror = () => { MessageToast.show(this._text('cannotConnect')); };
      },

      _dispatch: function(msg) {
        const oModel = this.getView().getModel('admin');
        switch (msg.type) {
          case 'adminGranted':
            oModel.setProperty('/granted', true);
            oModel.setProperty('/denied', false);
            break;
          case 'adminDenied':
            oModel.setProperty('/granted', false);
            oModel.setProperty('/denied', true);
            break;
          case 'adminStats':
            oModel.setProperty('/counts', msg.counts);
            oModel.setProperty('/aiMemory', msg.aiMemory);
            oModel.setProperty('/players', msg.players);
            oModel.setProperty('/games', msg.games);
            oModel.setProperty('/uptime', this._formatUptime(msg.uptimeSec));
            break;
        }
      },

      _formatUptime: function(iSeconds) {
        const h = Math.floor(iSeconds / 3600);
        const m = Math.floor((iSeconds % 3600) / 60);
        const s = iSeconds % 60;
        return this._text('uptimeValue', [String(h), String(m), String(s)]);
      },

      onResetAiMemory: function() {
        MessageBox.confirm(this._text('confirmResetAiMemory'), {
          onClose: (action) => {
            if (action === MessageBox.Action.OK) { this._send({ type: 'adminResetAiMemory' }); }
          },
        });
      },

      onKick: function(oEvent) {
        const sId = oEvent.getSource().getBindingContext('admin').getProperty('id');
        this._send({ type: 'adminKick', targetId: sId });
      },

      onEndGame: function(oEvent) {
        const sGameId = oEvent.getSource().getBindingContext('admin').getProperty('id');
        this._send({ type: 'adminEndGame', gameId: sGameId });
      },

      _send: function(oMsg) {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
          this._ws.send(JSON.stringify(oMsg));
        }
      },

      _closeWs: function() {
        if (this._ws) {
          this._ws.close();
          this._ws = null;
        }
      },

      onNavBack: function() {
        this._closeWs();
        this.getRouter().navTo('lobby');
      },

      onExit: function() {
        this._closeWs();
      },
    });
  }
);

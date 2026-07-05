sap.ui.define([
  'sap/ui/core/mvc/Controller'
], function(Controller) {
  'use strict';

  const WS_PORT = 8082;

  // Shared base for the app's controllers: common accessors + i18n helper.
  return Controller.extend('com.tic-tac-toe.controller.BaseController', {

    // Router of the owning component.
    getRouter: function() {
      return this.getOwnerComponent().getRouter();
    },

    // WebSocket URL: direct to the game server in local dev, through the
    // approuter "/game-server" route (wss on https) when deployed.
    getWsUrl: function() {
      const loc = window.location;
      if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
        return `ws://${loc.hostname}:${WS_PORT}`;
      }
      const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${loc.host}/game-server`;
    },

    // i18n ResourceBundle of the owning component.
    getResourceBundle: function() {
      return this.getOwnerComponent().getModel('i18n').getResourceBundle();
    },

    // Resolve an i18n text key (with optional {0},{1}… placeholders).
    _text: function(sKey, aArgs) {
      return this.getResourceBundle().getText(sKey, aArgs);
    }

  });
});

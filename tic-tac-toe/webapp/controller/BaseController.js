sap.ui.define([
  'sap/ui/core/mvc/Controller'
], function(Controller) {
  'use strict';

  // Shared base for the app's controllers: common accessors + i18n helper.
  return Controller.extend('com.tic-tac-toe.controller.BaseController', {

    // Router of the owning component.
    getRouter: function() {
      return this.getOwnerComponent().getRouter();
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

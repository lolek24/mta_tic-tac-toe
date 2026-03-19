sap.ui.define(['sap/ui/core/Control', 'sap/ui/core/Icon'], function(
  Control,
  Icon
) {
  'use strict';

  var ICON_X = 'sap-icon://decline';
  var ICON_O = 'sap-icon://circle-task';
  var ICON_SIZE = '4em';

  return Control.extend('com.tic-tac-toe.custom.ui.containers.customControl', {
    metadata: {
      properties: {
        symbol: { type: 'string', defaultValue: '' },
      },
      aggregations: {
        _icon: { type: 'sap.ui.core.Icon', multiple: false, visibility: 'hidden' },
      },
      events: {
        press: {},
      },
    },

    init: function() {
      this.setAggregation('_icon', new Icon({
        src: ICON_X,
        size: ICON_SIZE,
        visible: false,
      }));
    },

    renderer: function(oRm, oControl) {
      oRm.write('<div');
      oRm.writeControlData(oControl);
      oRm.addClass('tttCell');
      oRm.writeClasses();
      oRm.writeStyles();
      oRm.write('>');

      if (oControl.getSymbol()) {
        oRm.renderControl(oControl.getAggregation('_icon'));
      }

      oRm.write('</div>');
    },

    placeSymbol: function(symbol) {
      this.setProperty('symbol', symbol, true);
      var oIcon = this.getAggregation('_icon');
      oIcon.setSrc(symbol === 'X' ? ICON_X : ICON_O);
      oIcon.setVisible(true);
      this.invalidate();
    },

    onmousedown: function() {
      this.firePress();
    },
  });
});

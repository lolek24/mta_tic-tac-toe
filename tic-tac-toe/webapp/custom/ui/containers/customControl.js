sap.ui.define(['sap/ui/core/Control', 'sap/ui/core/Icon'], function(
  Control,
  Icon
) {
  'use strict';

  const ICON_X = 'sap-icon://decline';
  const ICON_O = 'sap-icon://circle-task';
  const ICON_SIZE = '4em';

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

    renderer: {
      apiVersion: 2,
      render: function(oRm, oControl) {
        oRm.openStart('div', oControl);
        oRm.class('tttCell');
        oRm.openEnd();

        if (oControl.getSymbol()) {
          oRm.renderControl(oControl.getAggregation('_icon'));
        }

        oRm.close('div');
      }
    },

    placeSymbol: function(symbol) {
      this.setProperty('symbol', symbol, true);
      const oIcon = this.getAggregation('_icon');
      oIcon.setSrc(symbol === 'X' ? ICON_X : ICON_O);
      oIcon.setVisible(true);
      this.invalidate();
    },

    onmousedown: function() {
      this.firePress();
    },
  });
});

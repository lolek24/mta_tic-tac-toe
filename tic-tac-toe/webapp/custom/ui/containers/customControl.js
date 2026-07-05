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
        // Accessible label for an empty cell (e.g. "Cell 5"); occupied cells
        // announce their symbol instead.
        label: { type: 'string', defaultValue: '' },
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
        const sSymbol = oControl.getSymbol();

        oRm.openStart('div', oControl);
        oRm.class('tttCell');
        // Focusable, operable button semantics for keyboard + screen readers.
        oRm.attr('role', 'button');
        oRm.attr('tabindex', '0');
        oRm.attr('aria-label', sSymbol || oControl.getLabel());
        oRm.openEnd();

        if (sSymbol) {
          oRm.renderControl(oControl.getAggregation('_icon'));
        }

        oRm.close('div');
      }
    },

    // Keep the icon in sync whenever the bound symbol changes.
    setSymbol: function(sSymbol) {
      this.setProperty('symbol', sSymbol);
      const oIcon = this.getAggregation('_icon');
      oIcon.setSrc(sSymbol === 'X' ? ICON_X : ICON_O);
      oIcon.setVisible(!!sSymbol);
      return this;
    },

    // Pointer (mouse + touch) activation.
    ontap: function() {
      this.firePress();
    },

    // Keyboard activation (Enter / Space).
    onsapenter: function() {
      this.firePress();
    },

    onsapspace: function(oEvent) {
      oEvent.preventDefault(); // stop the page from scrolling on Space
      this.firePress();
    },
  });
});

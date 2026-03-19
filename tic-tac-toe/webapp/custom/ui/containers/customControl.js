sap.ui.define(['sap/ui/core/Control', 'sap/ui/core/Icon'], function(
  Control,
  Icon
) {
  return Control.extend('com.tic-tac-toe.custom.ui.containers.customControl', {
    metadata: {
      properties: {
        symbol: {
          type: 'string',
          defaultValue: '',
        },
      },
      aggregations: {
        _icon: {
          type: 'sap.ui.core.Icon',
          multiple: false,
          visibility: 'hidden',
        },
      },
      events: {
        press: {},
      },
    },

    init: function() {
      this.setAggregation(
        '_icon',
        new Icon({
          src: 'sap-icon://decline',
          size: '4em',
          visible: false,
        })
      );
    },

    renderer: function(oRm, oControl) {
      oRm.write('<div');
      oRm.writeControlData(oControl);
      oRm.addClass('tttCell');
      oRm.writeClasses();
      oRm.writeStyles();
      oRm.write('>');

      var symbol = oControl.getSymbol();
      if (symbol) {
        oRm.renderControl(oControl.getAggregation('_icon'));
      }

      oRm.write('</div>');
    },

    placeSymbol: function(symbol) {
      this.setProperty('symbol', symbol, true);
      var oIcon = this.getAggregation('_icon');
      var iconSrc = symbol === 'X' ? 'sap-icon://decline' : 'sap-icon://circle-task';
      oIcon.setSrc(iconSrc);
      oIcon.setVisible(true);
      this.invalidate();
    },

    onmousedown: function(oEvent) {
      this.firePress(oEvent);
    },

    onAfterRendering: function() {
      if (sap.ui.core.Control.prototype.onAfterRendering) {
        sap.ui.core.Control.prototype.onAfterRendering.apply(this, arguments);
      }
    },
  });
});

sap.ui.define(['sap/ui/core/Control', 'sap/ui/core/Icon'], function(
  Control,
  Icon
) {
  return Control.extend('com.tic-tac-toe.custom.ui.containers.customControl', {
    metadata: {
      properties: {
        width: {
          type: 'sap.ui.core.CSSSize',
          defaultValue: '100%',
        },
        height: {
          type: 'sap.ui.core.CSSSize',
          defaultValue: 'auto',
        },
        icon: {
          type: 'sap.ui.core.Icon',
        },
        displayIcon: {
          type: 'boolean',
          defaultValue: false,
        },
      },
      aggregations: {
        content: {
          type: 'sap.ui.core.Control',
        },
        _actionIcon: {
          type: 'sap.ui.core.Icon',
          multiple: false,
          visibility: 'hidden',
        },
      },
      defaultAggregation: 'content',
      events: {
        hover: {},
        out: {},
        press: {
          parameters: {
            oEvent: {
              type: 'object',
            },
          },
        },
      },
    },

    init: function() {
      this.setAggregation(
        '_actionIcon',
        new Icon({
          src: this.icon,
        })
      );
    },
    renderer: function(oRm, oControl) {
      var icon = '';

      oRm.write('<div');
      oRm.writeControlData(oControl);
      //oRm.addStyle("background-color", "blue");
      oRm.addStyle('width', oControl.getProperty('width'));
      oRm.addStyle('height', oControl.getProperty('height'));
      oRm.writeStyles();
      oRm.write('>');

      // oControl.getAggregation("_actionIcon");
      oRm.renderControl(oControl.getAggregation('_actionIcon'));

      $(oControl.getContent()).each(function() {
        oRm.renderControl(this);
      });

      oRm.write('</div>');
    },
    onmousedown: function(oEvent) {
      this.getAggregation('_actionIcon').setSrc(this.getIcon());
      this.getAggregation('_actionIcon').setSize('5em');
      this.firePress(oEvent);
    },
    onmouseover: function() {
      //this.getAggregation("_actionIcon").setSrc(this.getIcon());
      //this.fireHover();
    },
    onmouseout: function() {},
    onAfterRendering: function() {
      //if I need to do any post render actions, it will happen here
      if (sap.ui.core.Control.prototype.onAfterRendering) {
        sap.ui.core.Control.prototype.onAfterRendering.apply(this, arguments); //run the super class's method first
      }
    },
    setIcon: function(iValue) {
      this.setProperty('icon', iValue, true);
    },
  });
});

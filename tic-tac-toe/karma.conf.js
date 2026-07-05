module.exports = function (config) {
	"use strict";

	config.set({
		frameworks: ["ui5"],
		ui5: {
			type: "application",
			// The app bootstraps UI5 from the CDN (see webapp/index.html), so run
			// the tests against the same runtime instead of a self-hosted framework.
			url: "https://sapui5.hana.ondemand.com",
			testpage: "webapp/test/testsuite.qunit.html"
		},
		browsers: ["ChromeHeadless"],
		singleRun: true,
		reporters: ["progress"]
	});
};

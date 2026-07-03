module.exports = function (config) {
	"use strict";

	config.set({
		// "ui5" must be first. Script mode loads the UI5 bootstrap + our test
		// modules; "qunit" is the karma adapter that runs/report the QUnit tests.
		frameworks: ["ui5", "qunit"],
		ui5: {
			type: "application",
			mode: "script",
			// The app bootstraps UI5 from the CDN (see webapp/index.html), so run
			// the tests against the same pinned runtime version.
			url: "https://sapui5.hana.ondemand.com/1.149.1",
			config: {
				async: true,
				resourceRoots: {
					"com/tic-tac-toe": "./base/webapp"
				}
			},
			tests: [
				"com/tic-tac-toe/test/unit/AllTests",
				"com/tic-tac-toe/test/integration/AllJourneys"
			]
		},
		browsers: ["ChromeHeadless"],
		singleRun: true,
		reporters: ["progress"]
	});
};

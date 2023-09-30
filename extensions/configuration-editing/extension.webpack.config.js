/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Tongji University. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');

module.exports = withDefaults({
	context: __dirname,
	entry: {
		extension: './src/configurationEditingMain.ts',
	},
	output: {
		filename: 'configurationEditingMain.js'
	},
	resolve: {
		mainFields: ['module', 'main']
	}
});

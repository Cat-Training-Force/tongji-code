/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Tongji University. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const INotebookKeymapService = createDecorator<INotebookKeymapService>('notebookKeymapService');

export interface INotebookKeymapService {
	readonly _serviceBrand: undefined;
}

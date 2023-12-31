/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Tongji University. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface INotebookWorkerHost {
	// foreign host request
	fhr(method: string, args: any[]): Promise<any>;
}

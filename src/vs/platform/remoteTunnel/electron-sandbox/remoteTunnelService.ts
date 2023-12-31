/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Tongji University. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSharedProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';
import { IRemoteTunnelService } from 'vs/platform/remoteTunnel/common/remoteTunnel';

registerSharedProcessRemoteService(IRemoteTunnelService, 'remoteTunnel');

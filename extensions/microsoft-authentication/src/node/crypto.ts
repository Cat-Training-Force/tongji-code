/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Tongji University. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nodeCrypto from 'crypto';

export const crypto: Crypto = nodeCrypto.webcrypto as any;

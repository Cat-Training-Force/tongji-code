/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Tongji University. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { normalizeGitHubUrl } from 'vs/platform/issue/common/issueReporterUtil';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IProductService } from 'vs/platform/product/common/productService';
import { IIssueUriRequestHandler, IWorkbenchIssueService } from 'vs/workbench/services/issue/common/issue';
import { IssueReporterData } from 'vs/platform/issue/common/issue';
import { userAgent } from 'vs/base/common/platform';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ILogService } from 'vs/platform/log/common/log';

export class WebIssueService implements IWorkbenchIssueService {
	declare readonly _serviceBrand: undefined;

	private readonly _handlers = new Map<string, IIssueUriRequestHandler>();

	constructor(
		@IExtensionService private readonly extensionService: IExtensionService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService
	) { }

	//TODO @TylerLeonhardt @Tyriar to implement a process explorer for the web
	async openProcessExplorer(): Promise<void> {
		console.error('openProcessExplorer is not implemented in web');
	}

	async openReporter(options: Partial<IssueReporterData>): Promise<void> {
		const extensionId = options.extensionId;
		// If we don't have a extensionId, treat this as a Core issue
		if (!extensionId) {
			if (this.productService.reportIssueUrl) {
				const uri = this.getIssueUriFromStaticContent(this.productService.reportIssueUrl);
				dom.windowOpenNoOpener(uri);
				return;
			}
			throw new Error(`No issue reporting URL configured for ${this.productService.nameLong}.`);
		}

		// If we have a handler registered for this extension, use it instead of anything else
		if (this._handlers.has(extensionId)) {
			try {
				const uri = await this.getIssueUriFromHandler(extensionId, CancellationToken.None);
				dom.windowOpenNoOpener(uri);
				return;
			} catch (e) {
				this.logService.error(e);
			}
		}

		// if we don't have a handler, or the handler failed, try to get the extension's github url
		const selectedExtension = this.extensionService.extensions.filter(ext => ext.identifier.value === options.extensionId)[0];
		const extensionGitHubUrl = this.getExtensionGitHubUrl(selectedExtension);
		if (!extensionGitHubUrl) {
			throw new Error(`Unable to find issue reporting url for ${extensionId}`);
		}

		const uri = this.getIssueUriFromStaticContent(`${extensionGitHubUrl}/issues/new`, selectedExtension);
		dom.windowOpenNoOpener(uri);
	}

	registerIssueUriRequestHandler(extensionId: string, handler: IIssueUriRequestHandler): IDisposable {
		this._handlers.set(extensionId, handler);
		return toDisposable(() => this._handlers.delete(extensionId));
	}

	private async getIssueUriFromHandler(extensionId: string, token: CancellationToken): Promise<string> {
		const handler = this._handlers.get(extensionId);
		if (!handler) {
			throw new Error(`No handler registered for extension ${extensionId}`);
		}
		const result = await handler.provideIssueUrl(token);
		return result.toString(true);
	}

	private getExtensionGitHubUrl(extension: IExtensionDescription): string {
		if (extension.isBuiltin && this.productService.reportIssueUrl) {
			return normalizeGitHubUrl(this.productService.reportIssueUrl);
		}

		let repositoryUrl = '';

		const bugsUrl = extension?.bugs?.url;
		const extensionUrl = extension?.repository?.url;

		// If given, try to match the extension's bug url
		if (bugsUrl && bugsUrl.match(/^https?:\/\/github\.com\/(.*)/)) {
			repositoryUrl = normalizeGitHubUrl(bugsUrl);
		} else if (extensionUrl && extensionUrl.match(/^https?:\/\/github\.com\/(.*)/)) {
			repositoryUrl = normalizeGitHubUrl(extensionUrl);
		}

		return repositoryUrl;
	}

	private getIssueUriFromStaticContent(baseUri: string, extension?: IExtensionDescription): string {
		const issueDescription = `ADD ISSUE DESCRIPTION HERE

Version: ${this.productService.version}
Commit: ${this.productService.commit ?? 'unknown'}
User Agent: ${userAgent ?? 'unknown'}
Embedder: ${this.productService.embedderIdentifier ?? 'unknown'}
${extension?.version ? `\nExtension version: ${extension.version}` : ''}
<!-- generated by web issue reporter -->`;

		return `${baseUri}?body=${encodeURIComponent(issueDescription)}&labels=web`;
	}
}

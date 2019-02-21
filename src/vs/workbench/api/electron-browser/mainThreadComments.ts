/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeEditor, isCodeEditor, isDiffEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import * as modes from 'vs/editor/common/modes';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { keys } from 'vs/base/common/map';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ExtHostCommentsShape, ExtHostContext, IExtHostContext, MainContext, MainThreadCommentsShape, CommentProviderFeatures } from '../node/extHost.protocol';

import { ICommentService, ICommentInfo } from 'vs/workbench/contrib/comments/electron-browser/commentService';
import { COMMENTS_PANEL_ID, CommentsPanel, COMMENTS_PANEL_TITLE } from 'vs/workbench/contrib/comments/electron-browser/commentsPanel';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { generateUuid } from 'vs/base/common/uuid';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommentsConfiguration } from 'vs/workbench/contrib/comments/electron-browser/comments.contribution';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { PanelRegistry, Extensions as PanelExtensions, PanelDescriptor } from 'vs/workbench/browser/panel';
import { IRange } from 'vs/editor/common/core/range';
import { Emitter, Event } from 'vs/base/common/event';

export class MainThreadDocumentCommentProvider implements modes.DocumentCommentProvider {
	private _proxy: ExtHostCommentsShape;
	private _handle: number;
	private _features: CommentProviderFeatures;
	get startDraftLabel(): string | undefined { return this._features.startDraftLabel; }
	get deleteDraftLabel(): string | undefined { return this._features.deleteDraftLabel; }
	get finishDraftLabel(): string | undefined { return this._features.finishDraftLabel; }
	get reactionGroup(): modes.CommentReaction[] | undefined { return this._features.reactionGroup; }

	constructor(proxy: ExtHostCommentsShape, handle: number, features: CommentProviderFeatures) {
		this._proxy = proxy;
		this._handle = handle;
		this._features = features;
	}

	async provideDocumentComments(uri, token) {
		return this._proxy.$provideDocumentComments(this._handle, uri);
	}

	async createNewCommentThread(uri, range, text, token) {
		return this._proxy.$createNewCommentThread(this._handle, uri, range, text);
	}

	async replyToCommentThread(uri, range, thread, text, token) {
		return this._proxy.$replyToCommentThread(this._handle, uri, range, thread, text);
	}

	async editComment(uri, comment, text, token) {
		return this._proxy.$editComment(this._handle, uri, comment, text);
	}

	async deleteComment(uri, comment, token) {
		return this._proxy.$deleteComment(this._handle, uri, comment);
	}

	async startDraft(uri, token): Promise<void> {
		return this._proxy.$startDraft(this._handle, uri);
	}
	async deleteDraft(uri, token): Promise<void> {
		return this._proxy.$deleteDraft(this._handle, uri);
	}
	async finishDraft(uri, token): Promise<void> {
		return this._proxy.$finishDraft(this._handle, uri);
	}
	async addReaction(uri, comment: modes.Comment, reaction: modes.CommentReaction, token): Promise<void> {
		return this._proxy.$addReaction(this._handle, uri, comment, reaction);
	}
	async deleteReaction(uri, comment: modes.Comment, reaction: modes.CommentReaction, token): Promise<void> {
		return this._proxy.$deleteReaction(this._handle, uri, comment, reaction);
	}


	onDidChangeCommentThreads = null;
}

export class MainThreadCommentThread implements modes.CommentThread2 {
	private _input: string = '';
	get input(): string {
		return this._input;
	}

	set input(value: string) {
		this._input = value;
		this._onDidChangeInput.fire(value);
	}

	private _onDidChangeInput = new Emitter<string>();
	get onDidChangeInput(): Event<string> { return this._onDidChangeInput.event; }

	private _activeComment?: modes.Comment;

	get activeComment(): modes.Comment {
		return this._activeComment;
	}

	set activeComment(comment: modes.Comment | undefined) {
		this._activeComment = comment;
		this._onDidChangeActiveComment.fire(comment);
	}

	private _onDidChangeActiveComment = new Emitter<modes.Comment | undefined>();
	get onDidChangeActiveComment(): Event<modes.Comment | undefined> { return this._onDidChangeActiveComment.event; }


	public get comments(): modes.Comment[] {
		return this._comments;
	}

	public set comments(newComments: modes.Comment[]) {
		this._comments = newComments;
		this._onDidChangeComments.fire(this._comments);
	}

	private _onDidChangeComments = new Emitter<modes.Comment[]>();
	get onDidChangeComments(): Event<modes.Comment[]> { return this._onDidChangeComments.event; }

	set acceptInputCommands(newCommands: modes.Command[]) {
		this._acceptInputCommands = newCommands;
		this._onDidChangeAcceptInputCommands.fire(this._acceptInputCommands);
	}

	get acceptInputCommands(): modes.Command[] {
		return this._acceptInputCommands;
	}

	private _onDidChangeAcceptInputCommands = new Emitter<modes.Command[]>();
	get onDidChangeAcceptInputCommands(): Event<modes.Command[]> { return this._onDidChangeAcceptInputCommands.event; }

	constructor(
		public commentThreadHandle: number,
		public control: MainThreadCommentControl,
		public extensionId: string,
		public threadId: string,
		public resource: string,
		public range: IRange,
		private _comments: modes.Comment[],
		private _acceptInputCommands: modes.Command[],
		public collapsibleState?: modes.CommentThreadCollapsibleState,
	) {

	}

	dispose() {

	}

	toJSON(): any {
		return {
			$mid: 7,
			commentControlHandle: this.control.handle,
			commentThreadHandle: this.commentThreadHandle,
		};
	}
}

export class MainThreadCommentControl {
	get handle(): number {
		return this._handle;
	}

	private _threads: Map<number, MainThreadCommentThread> = new Map<number, MainThreadCommentThread>();
	constructor(
		private _proxy: ExtHostCommentsShape,
		private _handle: number,
		private _id: string,
		private _label: string
	) { }

	createCommentThread(commentThreadHandle: number, threadId: string, resource: UriComponents, range: IRange, comments: modes.Comment[], commands: modes.Command[], collapseState: modes.CommentThreadCollapsibleState): modes.CommentThread2 {
		let thread = new MainThreadCommentThread(
			commentThreadHandle,
			this,
			'',
			threadId,
			URI.revive(resource).toString(),
			range,
			comments,
			commands,
			collapseState
		);

		this._threads.set(commentThreadHandle, thread);

		return thread;
	}

	deleteCommentThread(commentThreadHandle: number) {
		let thread = this._threads.get(commentThreadHandle);

		thread.dispose();
	}

	updateComments(commentThreadHandle: number, comments: modes.Comment[]) {
		let thread = this._threads.get(commentThreadHandle);
		thread.comments = comments;
	}

	updateAcceptInputCommands(commentThreadHandle: number, acceptInputCommands: modes.Command[]) {
		let thread = this._threads.get(commentThreadHandle);
		thread.acceptInputCommands = acceptInputCommands;
	}

	updateInput(commentThreadHandle: number, input: string) {
		let thread = this._threads.get(commentThreadHandle);
		thread.input = input;
	}

	getDocumentComments(resource: URI) {
		let ret = [];
		for (let thread of keys(this._threads)) {
			if (this._threads.get(thread).resource === resource.toString()) {
				ret.push(this._threads.get(thread));
			}
}

		return <ICommentInfo> {
			owner: String(this.handle),
			threads: ret,
			commentingRanges: [],
			draftMode: modes.DraftMode.NotSupported
		};
	}

	toJSON(): any {
		return {
			$mid: 6,
			handle: this.handle
		};
	}
}

@extHostNamedCustomer(MainContext.MainThreadComments)
export class MainThreadComments extends Disposable implements MainThreadCommentsShape {
	private _disposables: IDisposable[];
	private _proxy: ExtHostCommentsShape;
	private _documentProviders = new Map<number, IDisposable>();
	private _workspaceProviders = new Map<number, IDisposable>();
	private _handlers = new Map<number, string>();
	private _commentControls = new Map<number, MainThreadCommentControl>();

	private _activeCommentThread?: MainThreadCommentThread;
	private _activeComment?: modes.Comment;
	private _input?: string;
	private _openPanelListener: IDisposable | null;

	constructor(
		extHostContext: IExtHostContext,
		@IEditorService private readonly _editorService: IEditorService,
		@ICommentService private readonly _commentService: ICommentService,
		@IPanelService private readonly _panelService: IPanelService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
		this._disposables = [];
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostComments);
		this._disposables.push(this._commentService.onDidChangeActiveCommentThread(async thread => {
			let control = (thread as MainThreadCommentThread).control;

			if (!control) {
				return;
			}

			this._activeCommentThread = thread as MainThreadCommentThread;

			this._activeCommentThread.onDidChangeInput(input => { // todo, dispose
				this._input = input;
				this._proxy.$onActiveCommentWidgetChange(control.handle, this._activeCommentThread, this._activeComment, this._input);
			});

			this._activeCommentThread.onDidChangeActiveComment(comment => { // todo, dispose
				this._activeComment = comment;
				this._proxy.$onActiveCommentWidgetChange(control.handle, this._activeCommentThread, this._activeComment, this._input);
			});

			await this._proxy.$onActiveCommentWidgetChange(control.handle, this._activeCommentThread, this._activeComment, this._input);
		}));
	}

	$registerCommentControl(handle: number, id: string, label: string): void {
		const provider = new MainThreadCommentControl(this._proxy, handle, id, label);
		this._commentService.registerCommentControl(String(handle), provider);
		this._commentControls.set(handle, provider);
	}

	$createCommentThread(handle: number, commentThreadHandle: number, threadId: string, resource: UriComponents, range: IRange, comments: modes.Comment[], commands: modes.Command[], collapseState: modes.CommentThreadCollapsibleState): modes.CommentThread2 | undefined {
		let provider = this._commentControls.get(handle);

		if (!provider) {
			return;
		}

		return provider.createCommentThread(commentThreadHandle, threadId, resource, range, comments, commands, collapseState);
	}

	$deleteCommentThread(handle: number, commentThreadHandle: number) {
		let provider = this._commentControls.get(handle);

		if (!provider) {
			return;
		}

		return provider.deleteCommentThread(commentThreadHandle);
	}

	$updateComments(handle: number, commentThreadHandle: number, comments: modes.Comment[]) {
		let provider = this._commentControls.get(handle);

		if (!provider) {
				return;
			}

		provider.updateComments(commentThreadHandle, comments);
	}

	$setInputValue(handle: number, commentThreadHandle: number, input: string) {
		let provider = this._commentControls.get(handle);

		if (!provider) {
			return;
	}

		provider.updateInput(commentThreadHandle, input);

	}

	$updateCommentThreadCommands(handle: number, commentThreadHandle: number, acceptInputCommands: modes.Command[]) {
		let provider = this._commentControls.get(handle);

		if (!provider) {
			return;
		}

		provider.updateAcceptInputCommands(commentThreadHandle, acceptInputCommands);
	}

	$registerDocumentCommentProvider(handle: number, features: CommentProviderFeatures): void {
		this._documentProviders.set(handle, undefined);
		const handler = new MainThreadDocumentCommentProvider(this._proxy, handle, features);

		const providerId = generateUuid();
		this._handlers.set(handle, providerId);

		this._commentService.registerDataProvider(providerId, handler);
	}

	/**
	 * If the comments panel has never been opened, the constructor for it has not yet run so it has
	 * no listeners for comment threads being set or updated. Listen for the panel opening for the
	 * first time and send it comments then.
	 */
	private registerOpenPanelListener(commentsPanelAlreadyConstructed: boolean) {
		if (!commentsPanelAlreadyConstructed && !this._openPanelListener) {
			this._openPanelListener = this._panelService.onDidPanelOpen(e => {
				if (e.panel.getId() === COMMENTS_PANEL_ID) {
					keys(this._workspaceProviders).forEach(handle => {
						this._proxy.$provideWorkspaceComments(handle).then(commentThreads => {
							if (commentThreads) {
								const providerId = this._handlers.get(handle);
								this._commentService.setWorkspaceComments(providerId, commentThreads);
							}

						});
					});

					this._openPanelListener.dispose();
					this._openPanelListener = null;
				}
			});
		}
	}

	$registerWorkspaceCommentProvider(handle: number, extensionId: ExtensionIdentifier): void {
		this._workspaceProviders.set(handle, undefined);

		const providerId = generateUuid();
		this._handlers.set(handle, providerId);

		const commentsPanelAlreadyConstructed = this._panelService.getPanels().some(panel => panel.id === COMMENTS_PANEL_ID);
		Registry.as<PanelRegistry>(PanelExtensions.Panels).registerPanel(new PanelDescriptor(
			CommentsPanel,
			COMMENTS_PANEL_ID,
			COMMENTS_PANEL_TITLE,
			'commentsPanel',
			10
		));

		const openPanel = this._configurationService.getValue<ICommentsConfiguration>('comments').openPanel;

		if (openPanel === 'neverOpen') {
			this.registerOpenPanelListener(commentsPanelAlreadyConstructed);
		}

		if (openPanel === 'openOnSessionStart') {
			this._panelService.openPanel(COMMENTS_PANEL_ID);
		}

		this._proxy.$provideWorkspaceComments(handle).then(commentThreads => {
			if (commentThreads) {
				if (openPanel === 'openOnSessionStartWithComments' && commentThreads.length) {
					if (commentThreads.length) {
						this._panelService.openPanel(COMMENTS_PANEL_ID);
					} else {
						this.registerOpenPanelListener(commentsPanelAlreadyConstructed);
					}
				}

				this._commentService.setWorkspaceComments(providerId, commentThreads);
			}
		});

		/* __GDPR__
			"comments:registerWorkspaceCommentProvider" : {
				"extensionId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this._telemetryService.publicLog('comments:registerWorkspaceCommentProvider', {
			extensionId: extensionId.value
		});
	}

	$unregisterDocumentCommentProvider(handle: number): void {
		this._documentProviders.delete(handle);
		const handlerId = this._handlers.get(handle);
		this._commentService.unregisterDataProvider(handlerId);
		this._handlers.delete(handle);
	}

	$unregisterWorkspaceCommentProvider(handle: number): void {
		this._workspaceProviders.delete(handle);
		if (this._workspaceProviders.size === 0) {
			Registry.as<PanelRegistry>(PanelExtensions.Panels).deregisterPanel(COMMENTS_PANEL_ID);

			if (this._openPanelListener) {
				this._openPanelListener.dispose();
				this._openPanelListener = null;
			}
		}

		const handlerId = this._handlers.get(handle);
		this._commentService.removeWorkspaceComments(handlerId);
		this._handlers.delete(handle);
	}

	$onDidCommentThreadsChange(handle: number, event: modes.CommentThreadChangedEvent) {
		// notify comment service
		const providerId = this._handlers.get(handle);
		this._commentService.updateComments(providerId, event);
	}

	getVisibleEditors(): ICodeEditor[] {
		let ret: ICodeEditor[] = [];

		this._editorService.visibleControls.forEach(control => {
			if (isCodeEditor(control.getControl())) {
				ret.push(control.getControl() as ICodeEditor);
			}

			if (isDiffEditor(control.getControl())) {
				let diffEditor = control.getControl() as IDiffEditor;
				ret.push(diffEditor.getOriginalEditor(), diffEditor.getModifiedEditor());
			}
		});

		return ret;
	}

	async provideWorkspaceComments(): Promise<modes.CommentThread[]> {
		const result: modes.CommentThread[] = [];
		for (const handle of keys(this._workspaceProviders)) {
			result.push(...await this._proxy.$provideWorkspaceComments(handle));
		}
		return result;
	}

	async provideDocumentComments(resource: URI): Promise<modes.CommentInfo[]> {
		const result: modes.CommentInfo[] = [];
		for (const handle of keys(this._documentProviders)) {
			result.push(await this._proxy.$provideDocumentComments(handle, resource));
		}
		return result;
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
		this._workspaceProviders.forEach(value => dispose(value));
		this._workspaceProviders.clear();
		this._documentProviders.forEach(value => dispose(value));
		this._documentProviders.clear();
	}
}

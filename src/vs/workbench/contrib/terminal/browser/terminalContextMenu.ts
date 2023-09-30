/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Tongji University. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { ActionRunner, IAction } from 'vs/base/common/actions';
import { asArray } from 'vs/base/common/arrays';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { SingleOrMany } from 'vs/base/common/types';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenu } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ISerializedTerminalInstanceContext } from 'vs/workbench/contrib/terminal/common/terminal';

class InstanceContext {
	private _instanceId: number;

	constructor(instance: ITerminalInstance) {
		this._instanceId = instance.instanceId;
	}

	toJSON(): ISerializedTerminalInstanceContext {
		return {
			$mid: MarshalledId.TerminalContext,
			instanceId: this._instanceId
		};
	}
}

class TerminalContextActionRunner extends ActionRunner {
	constructor(
		private readonly _commandService: ICommandService
	) {
		super();
	}

	override run(action: IAction, context?: InstanceContext): Promise<void> {
		if (Array.isArray(context) && context.every(e => e instanceof InstanceContext)) {
			// arg1: The (first) focused instance
			// arg2: All selected instances
			return this._commandService.executeCommand(action.id, context?.[0], context);
		}
		return super.run(action, context);
	}
}

export function openContextMenu(event: MouseEvent, contextInstances: SingleOrMany<ITerminalInstance> | undefined, menu: IMenu, commandService: ICommandService, contextMenuService: IContextMenuService, extraActions?: IAction[]): void {
	const standardEvent = new StandardMouseEvent(event);

	const actions: IAction[] = [];

	createAndFillInContextMenuActions(menu, undefined, actions);

	if (extraActions) {
		actions.push(...extraActions);
	}

	const context: InstanceContext[] = contextInstances ? asArray(contextInstances).map(e => new InstanceContext(e)) : [];

	contextMenuService.showContextMenu({
		actionRunner: new TerminalContextActionRunner(commandService),
		getAnchor: () => standardEvent,
		getActions: () => actions,
		getActionsContext: () => context,
	});
}

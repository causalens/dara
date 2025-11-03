import { Status, copyToClipboard } from '@darajs/ui-utils';

import { resolveVariable } from '@/shared/interactivity/resolve-variable';
import { isSingleVariable, isVariable } from '@/types';
import { type ActionHandler, type CopyToClipboardImpl, UserError } from '@/types/core';

const CopyToClipboard: ActionHandler<CopyToClipboardImpl> = async (ctx, actionImpl): Promise<void> => {
    let value;

    if (!isVariable(actionImpl.value)) {
        value = actionImpl.value;
    } else {
        if (!isSingleVariable(actionImpl.value)) {
            throw new UserError('CopyToClipboard only supports simple Variables');
        }

        value = (await resolveVariable(actionImpl.value, ctx.wsClient, ctx.taskCtx, ctx.extras, (v) =>
            ctx.snapshot.getPromise(v)
        )) as string;
    }

    const success = await copyToClipboard(value);
    if (!success) {
        ctx.notificationCtx.pushNotification({
            key: '_copyToClipboard',
            message: actionImpl.error_message ?? '',
            status: Status.ERROR,
            title: 'Error copying to clipboard',
        });
    } else {
        ctx.notificationCtx.pushNotification({
            key: '_copyToClipboard',
            message: actionImpl.success_message ?? '',
            status: Status.SUCCESS,
            title: 'Copied to clipboard',
        });
    }
};

export default CopyToClipboard;

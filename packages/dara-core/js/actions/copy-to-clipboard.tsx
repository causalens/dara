import { Status, copyToClipboard } from '@darajs/ui-utils';

import { type ActionHandler, type CopyToClipboardImpl } from '@/types/core';

const CopyToClipboard: ActionHandler<CopyToClipboardImpl> = async (ctx, actionImpl): Promise<void> => {
    const success = await copyToClipboard(actionImpl.value);
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

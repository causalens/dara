import { type ActionHandler, type NotifyImpl } from '@/types/core';

const Notify: ActionHandler<NotifyImpl> = (ctx, actionImpl): void => {
    ctx.notificationCtx.pushNotification({
        key: actionImpl.key ?? actionImpl.title,
        message: actionImpl.message,
        status: actionImpl.status,
        title: actionImpl.title,
    });
};

export default Notify;

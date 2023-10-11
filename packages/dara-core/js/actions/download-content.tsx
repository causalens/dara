import { ActionHandler, DownloadContentImpl } from '@/types/core';

const DownloadContent: ActionHandler<DownloadContentImpl> = (ctx, actionImpl) => {
    window.open(`/api/core/download?code=${actionImpl.code}`, '_blank');
};

export default DownloadContent;

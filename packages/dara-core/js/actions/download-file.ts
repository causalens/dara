import { getBasename } from '@/router/utils';
import type { ActionHandler, ActionImpl } from '@/types/core';

interface DownloadFileImpl extends ActionImpl {
    code: string;
}

/** Start a native download without opening a tab after the original user activation has expired. */
const DownloadFile: ActionHandler<DownloadFileImpl> = (_ctx, { code }) => {
    const url = new URL(window.location.origin);
    url.pathname = `${getBasename().replace(/\/+$/, '')}/api/core/download`;
    url.searchParams.set('code', code);

    const link = document.createElement('a');
    link.href = url.href;
    link.download = '';
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
};

export default DownloadFile;

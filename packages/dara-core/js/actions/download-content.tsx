import type { ActionHandler, ActionImpl } from '../types/core';

/** Preserve the legacy DownloadContent payload using the existing download endpoint. */
const downloadContent: ActionHandler<ActionImpl & { code: string }> = (_context, action): Promise<void> => {
    window.open(`${window.dara.base_url}/api/core/download?code=${encodeURIComponent(action.code)}`, '_blank');
    return Promise.resolve();
};

export default downloadContent;

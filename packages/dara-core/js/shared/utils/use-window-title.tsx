import { useEffect } from 'react';

import { useConfig } from '@/api';

function useWindowTitle(pageTitle: string | undefined): void {
    const { data: config } = useConfig();

    useEffect(() => {
        if (!config) {
            return;
        }

        if (!pageTitle) {
            document.title = config.title;
            return;
        }
        document.title = `${config.title} - ${pageTitle}`;
    }, [config, config?.title, pageTitle]);
}

export default useWindowTitle;

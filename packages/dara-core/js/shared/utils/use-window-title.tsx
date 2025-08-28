import { useEffect } from 'react';

import { useConfig } from '../context/config-context';

function useWindowTitle(pageTitle: string | undefined, enabled: boolean = true): void {
    const config = useConfig();

    useEffect(() => {
        if (!enabled) {
            return;
        }
        if (!pageTitle) {
            document.title = config.title;
            return;
        }
        document.title = `${config.title} - ${pageTitle}`;
    }, [config, config.title, pageTitle, enabled]);
}

export default useWindowTitle;

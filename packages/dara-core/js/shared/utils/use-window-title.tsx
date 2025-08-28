import { useEffect } from 'react';

import { useConfig } from '../context/config-context';

function useWindowTitle(pageTitle: string | undefined, enabled: boolean = true): void {
    const config = useConfig();

    useEffect(() => {
        if (!enabled) {
            return;
        }
        if (!pageTitle) {
            console.log('setting title to', config.title);
            document.title = config.title;
            return;
        }
        console.log('setting title to', config.title, pageTitle);
        document.title = `${config.title} - ${pageTitle}`;
    }, [config, config.title, pageTitle, enabled]);
}

export default useWindowTitle;

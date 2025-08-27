import { useEffect } from 'react';

import { useConfig } from '../context/config-context';

function useWindowTitle(pageTitle: string | undefined): void {
    const config = useConfig();

    useEffect(() => {
        if (!pageTitle) {
            document.title = config.title;
            return;
        }
        document.title = `${config.title} - ${pageTitle}`;
    }, [config, config?.title, pageTitle]);
}

export default useWindowTitle;

import '@fortawesome/fontawesome-free/css/all.min.css';

import { injectCss } from './inject-css';

const Icon = injectCss('i');

/**
 * Get an arbitrary fontawesome icon
 *
 * @param icon - the icon to resolve, in a form of fontawesome classes, i.e. 'fa-solid fa-check'
 * @returns an Icon component
 */
export default function getIcon(icon: string): (props: any) => JSX.Element {
    let iconClasses = icon;

    // The icon string should have fontawesome classes. If it doesn't, for backwards compatibility
    // we'll assume user provided just the name of the icon, so let's try to resolve it to a proper fontawesome classname
    if (typeof icon === 'string' && !icon.includes('fa-')) {
        // in case user provided a title-cased icon name, split on TitleCase and join with '-'
        // i.e. AddressCard -> address-card
        const inferredIconName = icon
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .toLowerCase()
            .split(' ')
            .join('-');
        iconClasses = `fa-solid fa-${inferredIconName}`;
        // eslint-disable-next-line no-console
        console.warn(
            `Invalid fontawesome class string "${icon}" provided to getIcon(). This behaviour is deprecated and will be removed in the next version, please use "dara_core.css.get_icon" method. \nInferred class string: "${iconClasses}."`
        );
    }

    return (props) => <Icon {...props} className={`${String(props.className ?? '')} ${iconClasses}`} />;
}

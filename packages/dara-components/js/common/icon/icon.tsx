import { type StyledComponentProps, getIcon, useComponentStyles } from '@darajs/core';

interface IconProps extends StyledComponentProps {
    color?: string;
    icon: string;
}

function Icon(props: IconProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const IconComponent = getIcon(props.icon);

    const validStyle: any = { ...style };
    delete validStyle.fontWeight;

    return (
        <IconComponent
            $rawCss={css}
            style={{ alignItems: 'center', display: 'flex', ...validStyle, color: props.color }}
        />
    );
}

export default Icon;

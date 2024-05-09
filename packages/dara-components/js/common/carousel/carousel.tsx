import { useMemo } from 'react';

import {
    Action,
    ComponentInstance,
    DynamicComponent,
    StyledComponentProps,
    Variable,
    injectCss,
    useAction,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import { Carousel as UICarousel, CarouselItem as UICarouselItem } from '@darajs/ui-components';

interface CarouselItem extends Omit<UICarouselItem, 'component'> {
    component?: ComponentInstance;
    image_alt?: string;
    image_height?: string;
    image_width?: string;
}
interface CarouselProps extends StyledComponentProps {
    /** Pass through the className property */
    className: string;
    /** The list of items to display */
    items: Array<CarouselItem> | Variable<CarouselItem[]>;
    /** Action triggered when the component value has changed. */
    onchange?: Action;
    /** The value of the carousel */
    value?: Variable<number>;
}

const StyledCarousel = injectCss(UICarousel);

/**
 * The carousel component accepts a list of Items and displays them in a standard carousel format, beginning with the
 * first item in the list.
 *
 * @param props the component props
 */
function Carousel(props: CarouselProps): JSX.Element {
    const [items] = useVariable(props.items);
    const [value, setValue] = useVariable(props.value);
    const onCarouselAction = useAction(props.onchange);

    function handleChange(val: number): void {
        setValue(val);
        onCarouselAction(val);
    }

    const remappedItems = useMemo<UICarouselItem[]>(
        () =>
            items.map((item) => {
                const { component, ...rest } = item;

                if (component) {
                    return {
                        ...rest,
                        component: <DynamicComponent component={component} />,
                        imageAlt: item.image_alt,
                        imageHeight: item.image_height,
                        imageWidth: item.image_width,
                    };
                }

                return {
                    ...rest,
                    imageAlt: item.image_alt,
                    imageHeight: item.image_height,
                    imageWidth: item.image_width,
                };
            }),
        [items]
    );

    const [style, css] = useComponentStyles(props);
    return (
        <StyledCarousel
            $rawCss={css}
            className={props.className}
            items={remappedItems}
            onChange={handleChange}
            style={style}
            value={value}
        />
    );
}

export default Carousel;

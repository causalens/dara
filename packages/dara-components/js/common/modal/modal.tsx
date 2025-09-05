import {
    type ComponentInstance,
    DynamicComponent,
    type LayoutComponentProps,
    type Variable,
    injectCss,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import { Modal as UiModal } from '@darajs/ui-components';

interface ModalProps extends LayoutComponentProps {
    /** The children to be rendered within the modal */
    children: Array<ComponentInstance>;
    /** The show flag, tells the modal whether or not to display */
    show: Variable<boolean>;
}

const StyledModal = injectCss(UiModal);

/**
 * The modal component accepts a set of children and renders them within a modal depending on the value of the render flag.
 *
 * @param props the component props
 */
function Modal(props: ModalProps): JSX.Element {
    const [style, css] = useComponentStyles(props, false);
    const [show, setShow] = useVariable(props.show);

    function onAttemptClose(): void {
        setShow(false);
    }

    return (
        <StyledModal
            id={props.id_}
            $rawCss={css}
            onAttemptClose={onAttemptClose}
            render={show}
            style={{ alignItems: props.align, gap: '0.75rem', justifyContent: props.justify, ...style }}
        >
            {props.children.map((child, idx) => (
                <DynamicComponent component={child} key={`modal-${idx}-${child.uid}`} />
            ))}
        </StyledModal>
    );
}

export default Modal;

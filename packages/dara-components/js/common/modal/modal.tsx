import {
    type Action,
    type ComponentInstance,
    DynamicComponent,
    type LayoutComponentProps,
    type Variable,
    injectCss,
    useAction,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import { Modal as UiModal } from '@darajs/ui-components';

interface ModalProps extends LayoutComponentProps {
    /** The children to be rendered within the modal */
    children: Array<ComponentInstance>;
    /** The show flag, tells the modal whether or not to display */
    show: Variable<boolean>;
    /**
     * An optional event listener for if an external event (e.g. esc key) tries to close the modal, it's up to the
     * parent component to decide whether to close the modal
     */
    on_attempt_close?: Action;
    /**
     * A handler that's called when the modal has finished closing and has unmounted
     */
    on_closed?: Action;
}

const StyledModal = injectCss(UiModal);

/**
 * The modal component accepts a set of children and renders them within a modal depending on the value of the render flag.
 *
 * @param props the component props
 */
function Modal(props: ModalProps): JSX.Element {
    const onAttemptCloseAction = useAction(props.on_attempt_close);
    const onClosedAction = useAction(props.on_closed);
    const [style, css] = useComponentStyles(props, false);
    const [show, setShow] = useVariable(props.show);

    function onAttemptClose(): void {
        if (onAttemptCloseAction) {
            onAttemptCloseAction();
        } else {
            setShow(false);
        }
    }

    return (
        <StyledModal
            id={props.id_}
            $rawCss={css}
            onAttemptClose={onAttemptClose}
            onClosed={onClosedAction}
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

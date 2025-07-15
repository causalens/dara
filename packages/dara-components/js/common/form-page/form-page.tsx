import { type ComponentInstance, DynamicComponent, type StyledComponentProps, injectCss, useComponentStyles } from '@darajs/core';
import styled from '@darajs/styled-components';

const PageWrapper = styled.section`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
`;

const PageTitle = styled.h2`
    font-size: 1.4rem;
`;

export interface FormPageProps extends StyledComponentProps {
    /** The children to render in the body of the page */
    children: Array<ComponentInstance>;
    /** Passthrough the className property */
    className: string;
    /** Optional title of the page */
    title?: string;
}

const StyledWrapper = injectCss(PageWrapper);

function FormPage(props: FormPageProps): JSX.Element {
    const [style, css] = useComponentStyles(props);

    return (
        <StyledWrapper $rawCss={css} className={props.className} style={style}>
            {props.title && <PageTitle>{props.title}</PageTitle>}
            {props.children.map((child, idx) => (
                <DynamicComponent component={child} key={`form-page-${idx}-${child.uid}`} />
            ))}
        </StyledWrapper>
    );
}

export default FormPage;

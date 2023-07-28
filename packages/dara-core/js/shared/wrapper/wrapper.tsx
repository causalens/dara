import styled from '@darajs/styled-components';

interface WrapperProps {
    backgroundColor?: string;
    direction?: 'row' | 'column';
}

const Wrapper = styled.div<WrapperProps>`
    overflow: auto;
    display: flex;
    flex: 1 1 auto;
    flex-direction: ${(props) => props.direction};

    width: 100%;
    height: 100%;

    background-color: ${(props) => props.backgroundColor};
`;

export default Wrapper;

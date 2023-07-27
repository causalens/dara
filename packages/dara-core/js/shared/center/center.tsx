import styled from '@darajs/styled-components';

const Center = styled.div<{ colored?: boolean }>`
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    width: 100%;
    height: 100%;

    background: ${(props) => (props.colored ? props.theme.colors.blue1 : '')};
`;

export default Center;

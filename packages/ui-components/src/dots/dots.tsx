import styled from '@darajs/styled-components';

const Wrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;

    width: 100%;
    height: 100%;
`;

const FlashingDots = styled.div<{ $grey3?: string; $grey4?: string }>`
    position: relative;

    width: 10px;
    height: 10px;

    color: ${(props) => props.$grey4 ?? props.theme.colors.grey4};

    background-color: ${(props) => props.$grey4 ?? props.theme.colors.grey4};
    border-radius: 5px;

    animation: dot-flashing 1s infinite linear alternate;
    animation-delay: 0.5s;

    &::before,
    &::after {
        content: '';
        position: absolute;
        top: 0;
        display: inline-block;
    }

    &::before {
        left: -15px;

        width: 10px;
        height: 10px;

        color: ${(props) => props.$grey4 ?? props.theme.colors.grey4};

        background-color: ${(props) => props.$grey4 ?? props.theme.colors.grey4};
        border-radius: 5px;

        animation: dot-flashing 1s infinite alternate;
        animation-delay: 0s;
    }

    &::after {
        left: 15px;

        width: 10px;
        height: 10px;

        color: ${(props) => props.$grey4 ?? props.theme.colors.grey4};

        background-color: ${(props) => props.$grey4 ?? props.theme.colors.grey4};
        border-radius: 5px;

        animation: dot-flashing 1s infinite alternate;
        animation-delay: 1s;
    }

    @keyframes dot-flashing {
        0% {
            background-color: ${(props) => props.$grey4 ?? props.theme.colors.grey4};
        }

        50%,
        100% {
            background-color: ${(props) => props.$grey3 ?? props.theme.colors.grey3};
        }
    }
`;

interface DotsProps {
    className?: string;
    style?: React.CSSProperties;
    grey3?: string;
    grey4?: string;
}

function Dots(props: DotsProps): JSX.Element {
    return (
        <Wrapper className={props.className} style={props.style}>
            <FlashingDots $grey3={props.grey3} $grey4={props.grey4} data-testid="LOADING" />
        </Wrapper>
    );
}

export default Dots;

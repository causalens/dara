/* eslint-disable react-hooks/exhaustive-deps */
import { transparentize } from 'polished';
import { useContext, useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';

import styled from '@darajs/styled-components';
import { Button } from '@darajs/ui-components';

import { getSessionToken } from '@/api';
import DefaultFallback from '@/components/fallback/default';
import Center from '@/shared/center/center';
import { AuthCtx } from '@/shared/context';
import { getTokenKey } from '@/shared/utils';

import { verifySessionToken } from '../auth';

const Wrapper = styled.div`
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    justify-content: center;

    min-height: 100%;

    background: ${(props) =>
        `radial-gradient(circle closest-corner at 50% 40%, ${transparentize(
            0.9,
            props.theme.colors.background
        )} 0%, ${transparentize(
            0.8,
            props.theme.colors.blue4
        )} 70%),radial-gradient(circle closest-corner at 20% 150%, ${transparentize(
            0.8,
            props.theme.colors.error
        )} 0%, ${transparentize(0.2, props.theme.colors.blue4)} 230%)`};
`;

const Card = styled.div`
    padding: 1.5rem;

    color: ${(props) => props.theme.colors.text};

    background-color: ${(props) => props.theme.colors.blue1};
    border-radius: 1rem;
    box-shadow: ${(props) => props.theme.shadow.medium};

    @media (width >= 640px) {
        width: 100%;
        max-width: 24rem;
        margin-right: auto;
        margin-left: auto;
    }
`;

const FormWrapper = styled.div`
    margin-top: 1.5rem;
`;

const Form = styled.form`
    > * + * {
        margin-top: 1.5rem;
    }
`;

const ErrorText = styled.h3<{ $hidden?: boolean }>`
    margin: 0;

    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.25rem;
    color: ${(props) => props.theme.colors.error};
    letter-spacing: 0.025em;

    visibility: ${(props) => (props.$hidden ? 'hidden' : 'visible')};
`;

const Label = styled.label`
    font-weight: 500;
    line-height: 1.5rem;
`;

const StyledInput = styled.input<{ $error?: boolean }>`
    display: flex;
    display: block;
    align-items: center;

    width: 100%;
    height: 2.5rem;
    margin-top: 0.5rem;
    padding: 0 1rem;

    font-size: 1rem;
    line-height: 1.5rem;
    color: ${(props) => props.theme.colors.text};

    background-color: ${(props) => props.theme.colors.blue1};
    border: none;
    border-radius: 0.25rem;
    outline: none;
    box-shadow:
        inset 0 0 0 0 ${(props) => props.theme.colors.blue1},
        inset 0 0 0 1px ${(props) => (props.$error ? props.theme.colors.error : props.theme.colors.grey2)},
        0 1px 2px 0 rgb(0 0 0 / 5%);

    :active,
    :focus {
        box-shadow:
            inset 0 0 0 0 ${(props) => props.theme.colors.blue1},
            inset 0 0 0 2px ${(props) => (props.$error ? props.theme.colors.error : props.theme.colors.primary)},
            0 1px 2px 0 rgb(0 0 0 / 5%);
    }
`;

const StyledButton = styled(Button)`
    width: 100%;
    font-weight: 600;
    line-height: 1.5rem;
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 5%);

    :active,
    :focus {
        outline-color: ${(props) => props.theme.colors.primary};
        outline-width: 2px;
        outline-offset: 2px;
    }
`;

/**
 * The Login component gets the username and password from the user and generates a session token.
 */
function BasicAuthLogin(): JSX.Element {
    const [isVerifyingToken, setIsVerifyingToken] = useState(true);
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const [username, setUsername] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [isError, setIsError] = useState(false);
    const { token, setToken } = useContext(AuthCtx);

    const history = useHistory();
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);

    const previousLocation = queryParams.get('referrer') ?? '/';

    const login = async (): Promise<void> => {
        setIsLoggingIn(true);
        setIsError(false);

        try {
            const sessionToken: string = await getSessionToken({ password, username });

            if (sessionToken) {
                setToken(sessionToken);
                history.replace(decodeURIComponent(previousLocation));
            }
        } catch {
            setIsError(true);
        }

        setIsLoggingIn(false);
    };

    useEffect(() => {
        const key = getTokenKey();
        // If we landed on this page with a token already, verify it
        if (token) {
            // Grab the token from local storage again as it may have changed
            verifySessionToken(localStorage.getItem(key)).then((verified) => {
                // we already have a valid token, redirect
                if (verified) {
                    history.replace(decodeURIComponent(previousLocation));
                } else {
                    setIsVerifyingToken(false);
                }
            });
        } else {
            setIsVerifyingToken(false);
        }
    }, []);

    // Don't show the form yet until we check existing token
    if (isVerifyingToken) {
        return (
            <Center>
                <DefaultFallback />
            </Center>
        );
    }

    return (
        <Wrapper>
            <Card>
                <FormWrapper>
                    <Form
                        onSubmit={(e) => {
                            e.preventDefault();
                            login();
                        }}
                    >
                        <div>
                            <Label htmlFor="username">Username</Label>
                            <StyledInput
                                $error={isError}
                                id="username"
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                type="text"
                                value={username}
                            />
                        </div>

                        <div>
                            <Label htmlFor="password">Password</Label>
                            <StyledInput
                                $error={isError}
                                id="password"
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                type="password"
                                value={password}
                            />
                        </div>
                        <ErrorText $hidden={!isError} style={{ marginTop: '1rem' }}>
                            Incorrect Username or Password
                        </ErrorText>
                        <div>
                            <StyledButton
                                loading={isLoggingIn}
                                style={{ color: 'white' }}
                                styling="primary"
                                type="submit"
                            >
                                Sign in
                            </StyledButton>
                        </div>
                    </Form>
                </FormWrapper>
            </Card>
        </Wrapper>
    );
}

export default BasicAuthLogin;

import { act as componentAct, fireEvent, waitFor } from '@testing-library/react';
import { rest } from 'msw';

import { useAction } from '../../js/shared';
import { Action, DownloadContentInstance, SingleVariable } from '../../js/types/core';
import { server, wrappedRender } from './utils';

const { open } = window;

describe('useAction', () => {
    beforeEach(() => server.listen({ onUnhandledRequest: 'error' }));
    afterEach(() => server.resetHandlers());
    beforeAll(() => {
        // Delete the existing
        delete window.open;
        // Replace with the custom value
        window.open = jest.fn();
    });
    afterAll(() => {
        server.close();
        window.open = open;
    });

    it('should handle DOWNLOAD CONTENT action with extras', async () => {
        const variable: SingleVariable<string> = {
            __typename: 'Variable',
            default: 'value',
            nested: [],
            uid: 'uid',
        };

        const action: DownloadContentInstance = {
            extras: [variable],
            name: 'DownloadContent',
            uid: 'uid',
        };

        const MockComponent = (props: { action: Action }): JSX.Element => {
            const [download] = useAction(props.action);

            return (
                <>
                    {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
                    <button data-testid="download" onClick={() => download('value')} type="button">
                        download
                    </button>
                </>
            );
        };

        server.use(
            rest.post('/api/core/action/:uid', async (req, res, ctx) => {
                const { extras } = req.body as any;
                return res(ctx.json(JSON.stringify(extras)));
            })
        );

        const { getByTestId } = wrappedRender(<MockComponent action={action} />);

        await waitFor(() => expect(getByTestId('download').innerHTML).toBe('download'));

        componentAct(() => {
            const button = getByTestId('download');
            fireEvent.click(button);
        });

        await waitFor(() =>
            expect(window.open).toHaveBeenCalledWith(
                '/api/core/download?code={"data":[{"__ref":"Variable:uid"}],"lookup":{"Variable:uid":"value"}}',
                '_blank'
            )
        );
    });
});

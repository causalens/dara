/* eslint-disable import/no-extraneous-dependencies */
import { rest } from 'msw';
import { setupServer } from 'msw/node';

import { handlers } from './test-server-handlers';

// This creates a mock service worker that acts as a server for our tests. This means that we don't need to mock out
// fetch for each request individually and allows us to keep all the happy paths in one place and test the app as it
// would be used in production. See https://kentcdodds.com/blog/stop-mocking-fetch for more info on this technique.
const server = setupServer(...handlers);

export { server, rest };

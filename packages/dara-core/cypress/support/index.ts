/* eslint-disable @typescript-eslint/no-namespace */
// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************
// Import commands
import './commands';

declare global {
    namespace Cypress {
        interface Chainable {
            /**
             * Custom command to select the content container of a Dara Card component by its title.
             * @example cy.cardContent('Simple scenario')
             */
            cardContent(title: string): Chainable<JQuery<HTMLElement>>;
        }
    }
}

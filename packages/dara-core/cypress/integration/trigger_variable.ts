import { loginBeforeRoute } from '../support/utils';

describe('Trigger Variable action', () => {
    beforeEach(loginBeforeRoute('/trigger_variable'));

    it('Simple TriggerVariable scenario', () => {
        // Because of debouncing we need to spy on the request and wait for it to fire before checking the output
        cy.intercept('/api/core/derived-variable/trigger_var_dv').as('trigger');

        cy.cardContent('Simple scenario').within(() => {
            cy.contains('div', 'SIMPLE_INPUT')
                .next()
                .find('input')
                .should('have.value', 1)
                .then(($input) => {
                    cy.contains('div', 'SIMPLE_OUTPUT').next().as('output').should('have.text', 3);

                    cy.wrap($input)
                        .clear()
                        .type('5')
                        .then(() => {
                            cy.get('@output').should('have.text', 3);
                        });

                    cy.wait(1000);

                    cy.contains('button', 'SIMPLE_TRIGGER')
                        .click()
                        .then(() => {
                            cy.get('@output').should('have.text', 7);
                        });
                });
        });
    });
});

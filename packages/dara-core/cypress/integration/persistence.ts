import { loginBeforeRoute } from '../support/utils';

describe('Persistence API', () => {
    beforeEach(loginBeforeRoute('/persistence'));

    it('Persists variable with persist_value=True', () => {
        cy.cardContent('Simple scenario').within(() => {
            // Before changes
            cy.contains('div', 'PERSISTED_VALUE:').next().find('input').should('have.value', 'test');
            cy.contains('div', 'STATIC_VALUE:').next().find('input').should('have.value', 'static');

            // Update both inputs
            cy.get('input[value="test"]').clear().type('updated');
            cy.get('input[value="static"]').clear().type('updated');
        });

        // After reload, value with persist_value should be persisted
        cy.visit('/persistence').then(() => {
            cy.cardContent('Simple scenario').within(() => {
                cy.contains('div', 'PERSISTED_VALUE:').next().find('input').should('have.value', 'updated');
                cy.contains('div', 'STATIC_VALUE:').next().find('input').should('have.value', 'static');
            });
        });
    });

    it('Persistance works with nested variables', () => {
        cy.cardContent('Nested scenario').within(() => {
            // Before changes
            cy.contains('div', 'PERSISTED_VALUE:').next().find('input').should('have.value', 'test');

            // Update both inputs
            cy.get('input[value="test"]').clear().type('updated');

            // Wait for change to be persisted - wait because of debouncing
            cy.wait(1000);
        });

        // After reload, value with persist_value should be persisted
        cy.visit('/persistence').then(() => {
            cy.cardContent('Nested scenario').within(() => {
                cy.contains('div', 'PERSISTED_VALUE:').next().find('input').should('have.value', 'updated');
            });
        });
    });
});

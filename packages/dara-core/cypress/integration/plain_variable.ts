import { loginBeforeRoute } from '../support/utils';

describe('Plain Variable', () => {
    beforeEach(loginBeforeRoute('/plain_variable'));

    it('Simple Values are synchronised', () => {
        const defaultText = 'Default text';
        const newText = 'Text';

        cy.cardContent('Simple scenario').within(() => {
            cy.contains('div', 'Output:')
                .next()
                .should('have.text', defaultText)
                .then(($output) => {
                    cy.get('input')
                        .should('have.value', defaultText)
                        .clear()
                        .type(newText)
                        .then(() => {
                            cy.wrap($output).should('have.text', newText);
                        });
                });
        });
    });

    it('Nested values are updated correctly', () => {
        const defaultText = 'Default nested';
        const newText = 'New nested';

        cy.cardContent('Nested scenario').within(() => {
            cy.contains('div', 'Static:').next().as('static').should('have.text', 'STATIC');
            cy.contains('div', 'Nested Output:')
                .next()
                .should('have.text', defaultText)
                .then(($output) => {
                    cy.get('input')
                        .should('have.value', defaultText)
                        .clear()
                        .type(newText)
                        .then(() => {
                            cy.wrap($output).should('have.text', newText);
                            cy.get('@static').should('have.text', 'STATIC');
                        });
                });
        });
    });
});

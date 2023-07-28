import { loginBeforeRoute } from '../support/utils';

describe('NavigateTo', () => {
    beforeEach(loginBeforeRoute('/navigate_to'));

    it('Navigates to a static URL', () => {
        cy.cardContent('Simple scenario').within(() => {
            cy.contains('button', 'NAVIGATE_BASIC')
                .click()
                .then(() => {
                    cy.url().should('include', '/a_home');
                    cy.document().its('body').contains('div', 'HOME');
                });
        });
    });

    it('Navigates to a URL returned by a function', () => {
        cy.cardContent('Function scenario').within(() => {
            cy.contains('button', 'NAVIGATE_FUNCTION')
                .click()
                .then(() => {
                    cy.url().should('include', '/a_home');
                    cy.document().its('body').contains('div', 'HOME');
                });
        });
    });
});

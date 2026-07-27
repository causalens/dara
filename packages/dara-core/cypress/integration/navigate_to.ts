import { loginBeforeRoute } from '../support/utils';

describe('NavigateTo', () => {
    beforeEach(loginBeforeRoute('/navigate_to'));

    it('Navigates to a static URL', () => {
        cy.cardContent('Simple scenario').within(() => {
            cy.contains('button', 'NAVIGATE_BASIC').click();
        });
        cy.url().should('include', '/a_home');
        cy.contains('div', 'HOME');
    });

    it('Navigates to a URL returned by a function', () => {
        cy.cardContent('Function scenario').within(() => {
            cy.contains('button', 'NAVIGATE_FUNCTION').click();
        });
        cy.url().should('include', '/a_home');
        cy.contains('div', 'HOME');
    });
});

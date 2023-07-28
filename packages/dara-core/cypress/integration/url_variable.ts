import { loginBeforeRoute } from '../support/utils';

describe('Url Variable', () => {
    beforeEach(loginBeforeRoute('/url_variable'));

    it('Updates URL correctly', () => {
        cy.cardContent('Simple scenario').within(() => {
            cy.url().should('include', '/url_variable');

            cy.contains('h2', 'Tab2')
                .click()
                .then(() => {
                    cy.url().should('include', '/url_variable?selected_tab=Tab2');

                    cy.contains('h2', 'Tab1')
                        .click()
                        .then(() => {
                            cy.url().should('include', '/url_variable?selected_tab=Tab1');
                        });
                });
        });
    });
});

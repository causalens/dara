import { loginBeforeRoute } from '../support/utils';

function visitViaSidebar(page: string): void {
    cy.contains('a', page).click();
    cy.waitFor('url:changed');
    cy.url().should((url) => expect(url).to.contain(page));
}

describe('Page Variables', () => {
    it('resets specified variables on page load', () => {
        // Navigate to page with reset specified
        loginBeforeRoute('/page_variables_1')();

        function getInput(title: string): Cypress.Chainable<JQuery<HTMLInputElement>> {
            return cy.contains('div', title).next().find('input');
        }

        // Update 1&2 to 3&4
        getInput('Var1:').clear().type('3');
        getInput('Var2:').clear().type('4');
        cy.wait(1000);

        // Go to /home and back to the page
        visitViaSidebar('home');
        visitViaSidebar('page_variables_1');

        // Variables should be reset
        getInput('Var1:').should('have.value', '1');
        getInput('Var2:').should('have.value', '2');
        cy.wait(1000);

        // Navigate to page without reset specified
        visitViaSidebar('page_variables_2');

        // Update 1&2 to 3&4
        getInput('Var1:').clear().type('3');
        getInput('Var2:').clear().type('4');
        cy.wait(1000);

        // Go to /home and back to the page
        visitViaSidebar('home');
        visitViaSidebar('page_variables_2');

        // Variables should not be reset
        getInput('Var1:').should('have.value', '3');
        getInput('Var2:').should('have.value', '4');
    });
});

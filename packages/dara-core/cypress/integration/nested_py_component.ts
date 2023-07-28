import { loginBeforeRoute } from '../support/utils';

describe('Nested py_components', () => {
    beforeEach(loginBeforeRoute('/nested_py_component'));

    it('should render nested py_components', () => {
        /**
         * Note: this test checks both scenarios at the same time as we want to make sure the py_components
         * work on the initial render - that's where the issues were previously.
         *
         * Expected:
         * all nested py_compontents render correctly, no errors are present on the page.
         *
         * Test Steps:
         * - render nested py_components structures
         * - make sure they are displayed without errors
         */
        cy.cardContent('Nested definition scenario').within(() => {
            cy.contains('div', 'Dollar:').next().should('have.text', '$100');

            cy.contains('div', 'Hash:').next().should('have.text', '#100');

            cy.contains('div', 'Percent:').next().should('have.text', '%100');
        });

        cy.cardContent('Upfront definition scenario').within(() => {
            cy.contains('div', 'Dollar:').next().should('have.text', '$100');

            cy.contains('div', 'Hash:').next().should('have.text', '#100');

            cy.contains('div', 'Percent:').next().should('have.text', '%100');
        });
    });
});

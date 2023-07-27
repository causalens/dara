import { LOADING_CLASS } from '../support/constants';
import { loginBeforeRoute, type } from '../support/utils';

describe('ResetVariables', () => {
    beforeEach(loginBeforeRoute('/reset_variables'));

    it('resets DerivedVariable', () => {
        /**
         * Expected:
         * Running a ResetVariables action on a root variable should reset it to its default, updating a dependant
         * DerivedVariable as well.
         * Running a ResetVariables action on a DerivedVariable should force a re-calculation, in addition ignoring
         * the cache.
         *
         * Test Steps:
         * - update input value to 'text'
         * - observe that output contains 'text'
         * - click 'Reset Root' button
         * - both input and output should be updated back to 'text' and 'text{number}' respectively
         * - record the output value
         * - click 'Reset DV' button
         * - record the output value again, make sure that it changed (because of a new random number being appended)
         */

        const defaultText = 'text';
        const updatedText = 'updated';

        cy.cardContent('DerivedVariable scenario').within(($card) => {
            const checkLoading = (): Cypress.Chainable<JQuery<HTMLElement>> =>
                cy.wrap($card).find(LOADING_CLASS).should('not.exist');

            cy.contains('div', 'Input:').next().find('input').as('input').should('have.value', defaultText);
            cy.contains('div', 'Output:').next().as('output').should('contain.text', defaultText);

            // Update input
            type('@input', updatedText, checkLoading);
            cy.get('@output').should('contain.text', updatedText);

            // Reset root variable
            cy.contains('button', 'Reset Root').click();

            // Both root and derived variables should be updated
            cy.get('@input').should('have.value', defaultText);
            cy.get('@output')
                .should('contain.text', defaultText)
                .then(($output) => {
                    const val = $output.text();

                    cy.intercept('/api/core/derived-variable/**').as('update');

                    // Reset DerivedVariable
                    cy.contains('button', 'Reset DV').click();

                    cy.wait('@update');
                    checkLoading();

                    // .should automatically re-runs assertion
                    cy.get('@output').should(($newOutput) => {
                        const newVal = $newOutput.text();
                        // It should've been re-calculated with 'force' flag - new number should be appended
                        expect(newVal).not.equals(val);
                    });
                });
        });
    });
});

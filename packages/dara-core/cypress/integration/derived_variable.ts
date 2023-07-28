import { LOADING_CLASS } from '../support/constants';
import { loginBeforeRoute, type } from '../support/utils';

const assertLoadingFinished = (aliases: string[]) => () => {
    aliases.forEach((alias) => {
        cy.get(alias).parent().find(LOADING_CLASS).should('not.exist');
    });
};

describe('DerivedVariable', () => {
    beforeEach(loginBeforeRoute('/derived_variable'));

    it('Variable can be create_from_derived', () => {
        /**
         * Expected:
         * variable created from derived tracks updates from the derived variable until modified,
         * after being modified its value is no longer tied to the other derived variable.
         *
         * Test Steps:
         * - Check if formatted and mutable have correct values
         * - Modify initial input and check both formatted and mutable are updated
         * - Modify mutable
         * - Modify initial input -> formatted should update, mutable should not
         * - Click reset -> mutable should update to the initial value
         * - Modify initial input -> both formatted and mutable should update again
         */
        const checkLoading = assertLoadingFinished(['@input', '@formatted', '@mutable']);

        const defaultText = 'Text';
        const updatedText = 'Updated';
        const updatedMutable = 'Mutable_updated';
        const finalUpdate = '111';

        cy.cardContent('Create from derived').within(() => {
            cy.contains('div', 'Formatted:').next().as('formatted').should('have.text', `${defaultText}%`);
            cy.contains('div', 'Input:').next().find('input').as('input').should('have.value', defaultText);
            cy.contains('div', 'Mutable:').next().find('input').as('mutable').should('have.value', `${defaultText}%`);

            type('@input', updatedText, checkLoading);

            // Modifying initial input should update formatted&mutable
            cy.get('@formatted').should('have.text', `${updatedText}%`);
            cy.get('@mutable').should('have.value', `${updatedText}%`);

            // Modify mutable
            type('@mutable', updatedMutable, checkLoading);

            // Modifying initial input should no longer update mutable
            type('@input', finalUpdate, checkLoading);
            cy.get('@formatted').should('have.text', `${finalUpdate}%`);
            cy.get('@mutable').should('have.value', updatedMutable);

            // Click reset - mutable should be reset to the Input variable as it was created from it
            cy.get('button').click();
            checkLoading();
            cy.get('@mutable').should('have.value', `${finalUpdate}%`);

            // If we update the initial text, mutable should be synced with it again
            type('@input', defaultText, checkLoading);
            cy.get('@mutable').should('have.value', `${defaultText}%`);
        });
    });
});

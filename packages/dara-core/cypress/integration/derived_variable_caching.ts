import { LOADING_CLASS } from '../support/constants';
import { loginBeforeRoute } from '../support/utils';

const defaultScenarioText = 'DEFAULT SCENARIO: ';
const globalScenarioText = 'GLOBAL SCENARIO: ';
const sessionScenarioText = 'SESSION SCENARIO: ';
const noneScenarioText = 'NONE SCENARIO: ';

const checkNoLoadingSpinner = (searchText: string) => () => {
    cy.contains('div', searchText).parent().find(LOADING_CLASS).should('not.exist');
};

describe('Derived Variable Caching', () => {
    beforeEach(loginBeforeRoute('/derived_variable_caching'));

    it('should use cache based on cache setting in page definition', () => {
        /**
         * Expected:
         * global, session and no cache setting should cache the value and use it
         * when cache=none, the derived variable should be recomputed.
         *
         * Test Steps:
         * - Set input value to 2
         * - Record values of derived variables
         * - Set input value to another number, then back to 2
         * - Check recomuted derived variables to see if they use the cached value for input '2'
         */

        cy.cardContent('Derived Variables').within(() => {
            cy.get('input').clear().type('2').wait(1000);

            checkNoLoadingSpinner(defaultScenarioText);

            cy.contains('div', defaultScenarioText).next().as('defaultEl');
            cy.contains('div', globalScenarioText).next().as('globalEl');
            cy.contains('div', sessionScenarioText).next().as('sessionEl');
            cy.contains('div', noneScenarioText).next().as('noneEl');

            // Store the html in variables
            let defaultValueWith2;
            let globalValueWith2;
            let sessionValueWith2;
            let noneValueWith2;

            cy.get('@defaultEl')
                .invoke('html')
                .then((html) => {
                    defaultValueWith2 = html;
                });

            cy.get('@globalEl')
                .invoke('html')
                .then((html) => {
                    globalValueWith2 = html;
                });

            cy.get('@sessionEl')
                .invoke('html')
                .then((html) => {
                    sessionValueWith2 = html;
                });

            cy.get('@noneEl')
                .invoke('html')
                .then((html) => {
                    noneValueWith2 = html;
                });

            // Reset the input
            cy.get('input').clear().wait(1000).type('2').wait(1000);

            // Recheck values
            // Direct comparison is used here to compare the stored value and current value
            cy.get('@defaultEl')
                .invoke('html')
                .should((html) => {
                    expect(html).to.equal(defaultValueWith2);
                });

            cy.get('@globalEl')
                .invoke('html')
                .should((html) => {
                    expect(html).to.equal(globalValueWith2);
                });

            cy.get('@sessionEl')
                .invoke('html')
                .should((html) => {
                    expect(html).to.equal(sessionValueWith2);
                });

            cy.get('@noneEl')
                .invoke('html')
                .should((html) => {
                    expect(html).to.not.equal(noneValueWith2);
                });
        });
    });
});

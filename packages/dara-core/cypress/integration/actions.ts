import { LOADING_CLASS } from '../support/constants';
import { loginBeforeRoute } from '../support/utils';

describe('Actions', () => {
    beforeEach(loginBeforeRoute('/actions'));

    it('Action using DerivedVariable hits cache', () => {
        cy.cardContent('Action Cache Hit').within((card) => {
            cy.wrap(card).find(LOADING_CLASS).should('not.exist');

            cy.contains('div', 'Input:')
                .next()
                .invoke('text')
                .then((txt) => {
                    // target should be null at first
                    cy.contains('div', 'Target:').next().should('have.text', 'null');

                    // run the action
                    cy.get('button').contains('Set').click();

                    // target should be set to the input value
                    cy.contains('div', 'Target:').next().should('have.text', txt);
                });
        });
    });
});

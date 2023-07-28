import { SPINNER_CLASS } from '../support/constants';
import { interceptIndefinitely, loginBeforeRoute } from '../support/utils';

describe('Update Variable action', () => {
    beforeEach(loginBeforeRoute('/update_variable'));

    it('Simple UpdateVariable scenario', () => {
        cy.cardContent('Simple scenario').within(() => {
            cy.contains('div', 'SIMPLE_RESULT')
                .next()
                .should('have.text', 0)
                .then(($output) => {
                    cy.get('button')
                        .should('have.text', 'SIMPLE_UPDATE')
                        .click()
                        .then(() => {
                            cy.wrap($output).should('have.text', 5);
                        });
                });
        });
    });

    it('UpdateVariable with plain variable extra', () => {
        cy.cardContent('Simple extra scenario').within(() => {
            cy.contains('div', 'SIMPLE_EXTRA_RESULT')
                .next()
                .should('have.text', 0)
                .then(($output) => {
                    cy.get('button')
                        .should('have.text', 'SIMPLE_EXTRA_UPDATE')
                        .click()
                        .then(() => {
                            cy.wrap($output).should('have.text', 1);
                        });
                });
        });
    });

    it('UpdateVariable with single task DerivedVariable', () => {
        const interception = interceptIndefinitely('/api/core/action/*');
        cy.cardContent('Single DV scenario').within(() => {
            cy.contains('div', 'SINGLE_DV_RESULT')
                .next()
                .should('have.text', 0)
                .then(($output) => {
                    cy.get('button')
                        .should('have.text', 'SINGLE_DV_UPDATE')
                        .click()
                        .then(($button) => {
                            cy.wrap($button)
                                .find(SPINNER_CLASS) // make sure loading state is shown on button
                                .then(() => {
                                    interception.sendResponse();

                                    cy.wrap($output).should('have.text', 2);
                                });
                        });
                });
        });
    });

    it('UpdateVariable with multi task DerivedVariable', () => {
        const interception = interceptIndefinitely('/api/core/action/*');

        cy.cardContent('Multi DV scenario').within(() => {
            cy.contains('div', 'MULTI_DV_RESULT')
                .next()
                .should('have.text', 0)
                .then(($output) => {
                    cy.get('button')
                        .should('have.text', 'MULTI_DV_UPDATE')
                        .click()
                        .then(($button) => {
                            cy.wrap($button)
                                .find(SPINNER_CLASS)
                                .then(() => {
                                    interception.sendResponse();
                                    cy.wrap($output).should('have.text', 5);
                                });
                        });
                });
        });
    });

    it('UpdateVariable sequential updates', () => {
        cy.cardContent('Sequential scenario').within(() => {
            cy.contains('div', 'SEQ_RESULT_1')
                .next()
                .should('have.text', 1)
                .then(($output1) => {
                    cy.contains('div', 'SEQ_RESULT_2')
                        .next()
                        .should('have.text', 2)
                        .then(($output2) => {
                            cy.get('button')
                                .should('have.text', 'SEQ_UPDATE')
                                .click()
                                .then(() => {
                                    cy.wrap($output1).should('have.text', 4);
                                    cy.wrap($output2).should('have.text', 5);
                                });
                        });
                });
        });
    });

    it('UpdateVariable increments', () => {
        cy.cardContent('Increment scenario').within(() => {
            cy.contains('div', 'INC_RESULT')
                .next()
                .should('have.text', 1)
                .then(($output) => {
                    cy.get('button')
                        .should('have.text', 'INC_UPDATE')
                        .click()
                        .then(($button) => {
                            cy.wrap($output).should('have.text', 2);

                            cy.wrap($button)
                                .click()
                                .then(() => {
                                    cy.wrap($output).should('have.text', 3);
                                });
                        });
                });
        });
    });
});

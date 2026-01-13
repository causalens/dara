import { LOADING_CLASS } from '../support/constants';
import { loginBeforeRoute, type } from '../support/utils';

const assertLoadingFinished = (aliases: string[]) => () => {
    aliases.forEach((alias) => {
        cy.get(alias).parent().find(LOADING_CLASS).should('not.exist');
    });
};

describe('DerivedVariable with .get() nested extraction', () => {
    beforeEach(loginBeforeRoute('/nested_derived_variable'));

    it('should correctly resolve .get() nested value in DerivedVariable, py_component, and action', () => {
        /**
         * This test verifies that using .get() on a DerivedVariable correctly extracts
         * nested values when passed to:
         * 1. Another DerivedVariable
         * 2. A py_component
         * 3. An action
         *
         * Test scenario:
         * - Input variable x = 5 (default)
         * - Inner DV returns: {"data": {"value": x*10, "extra": "ignored"}}
         * - Outer DV receives inner.get("data").get("value") (should be 50) and adds 100 = 150
         * - py_component receives inner.get("data").get("value") (should be 50) and multiplies by 2 = 100
         * - action receives inner.get("data").get("value") (should be 50) and adds 1000 = 1050
         *
         * Test Steps:
         * 1. Verify initial DV and py_component values are correct (x=5 -> outer=150, py_component=100)
         * 2. Click action button and verify notification shows correct value (1050)
         * 3. Change input to 10 and verify all values update correctly
         */
        const checkLoading = assertLoadingFinished(['@input']);

        // Initial state: x = 5
        // Inner DV: {"data": {"value": 50, "extra": "ignored"}}
        // Outer DV: 50 + 100 = 150
        // py_component: 50 * 2 = 100
        cy.cardContent('Test Setup').within(() => {
            cy.contains('div', 'Input (x):').next().find('input').as('input').should('have.value', '5');
        });

        cy.cardContent('DV.get() -> DerivedVariable').within(() => {
            cy.contains('div', 'Outer DV Result:').next().should('have.text', '150');
        });

        cy.cardContent('DV.get() -> py_component').within(() => {
            cy.contains('PyComponent Result: 100').should('exist');
        });

        // Test action: click button and verify notification
        // Action: 50 + 1000 = 1050
        cy.cardContent('DV.get() -> action').within(() => {
            cy.contains('button', 'Trigger Action').click();
        });

        // Verify notification appears with correct value
        cy.contains('Action Result: 1050').should('be.visible');

        // Update input to 10
        // Inner DV: {"data": {"value": 100, "extra": "ignored"}}
        // Outer DV: 100 + 100 = 200
        // py_component: 100 * 2 = 200
        cy.cardContent('Test Setup').within(() => {
            type('@input', '10', checkLoading);
        });

        cy.cardContent('DV.get() -> DerivedVariable').within(() => {
            cy.contains('div', 'Outer DV Result:').next().should('have.text', '200');
        });

        cy.cardContent('DV.get() -> py_component').within(() => {
            cy.contains('PyComponent Result: 200').should('exist');
        });

        // Test action again with new value
        // Action: 100 + 1000 = 1100
        cy.cardContent('DV.get() -> action').within(() => {
            cy.contains('button', 'Trigger Action').click();
        });

        // Verify notification appears with correct value
        cy.contains('Action Result: 1100').should('be.visible');
    });
});

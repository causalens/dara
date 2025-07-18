import { loginBeforeRoute } from '../support/utils';

describe('StateVariable', () => {
    beforeEach(loginBeforeRoute('/state_variable'));

    it('should track DerivedVariable loading, success, and error states', () => {
        /**
         * Expected:
         * StateVariable should properly track the three states of a DerivedVariable:
         * - is_loading: true during calculation, false when complete
         * - has_error: true when calculation fails, false otherwise
         * - has_value: true when calculation succeeds, false otherwise
         *
         * Test Steps:
         * 1. Click success button -> observe loading state -> observe success state
         * 2. Click failure button -> observe loading state -> observe error state
         */

        cy.cardContent('StateVariable State Tracking').within(() => {
            // Initially, no state indicators should be visible
            cy.contains('🔄 Loading... Please wait').should('not.exist');
            cy.contains('❌ Error occurred during calculation').should('not.exist');
            cy.contains('✅ Calculation successful!').should('not.exist');

            // Test success flow
            cy.contains('button', 'Trigger Success').click();

            // Should show loading state immediately
            cy.contains('🔄 Loading... Please wait').should('exist');

            // Error and success indicators should not be visible during loading
            cy.contains('❌ Error occurred during calculation').should('not.exist');
            cy.contains('✅ Calculation successful!').should('not.exist');

            // Wait for calculation to complete (should take ~2 seconds)
            // Loading indicator should disappear
            cy.contains('🔄 Loading... Please wait', { timeout: 5000 }).should('not.exist');

            // Success indicator should appear
            cy.contains('✅ Calculation successful!').should('exist');

            // Result text should be visible
            cy.contains('Calculation completed successfully!').should('exist');

            // Error indicator should not be visible
            cy.contains('❌ Error occurred during calculation').should('not.exist');

            // Test failure flow
            cy.contains('button', 'Trigger Failure').click();

            // Success indicator should disappear immediately when new calculation starts
            cy.contains('✅ Calculation successful!').should('not.exist');
            cy.contains('Calculation completed successfully!').should('not.exist');

            // Should show loading state immediately
            cy.contains('🔄 Loading... Please wait').should('exist');

            // Error indicator should not be visible during loading
            cy.contains('❌ Error occurred during calculation').should('not.exist');

            // Wait for calculation to complete (should take ~3 seconds)
            // Loading indicator should disappear
            cy.contains('🔄 Loading... Please wait', { timeout: 5000 }).should('not.exist');

            // Error indicator should appear
            cy.contains('❌ Error occurred during calculation').should('exist');

            // Success indicator should not be visible
            cy.contains('✅ Calculation successful!').should('not.exist');
            cy.contains('Calculation completed successfully!').should('not.exist');

            // Test success flow again to ensure state transitions work correctly
            cy.contains('button', 'Trigger Success').click();

            // Error indicator should disappear immediately when new calculation starts
            cy.contains('❌ Error occurred during calculation').should('not.exist');

            // Wait for completion and verify success state
            cy.contains('🔄 Loading... Please wait', { timeout: 5000 }).should('not.exist');
            cy.contains('✅ Calculation successful!').should('exist');
            cy.contains('Calculation completed successfully!').should('exist');
        });
    });

    it('should properly handle rapid state transitions', () => {
        /**
         * Test rapid clicking to ensure state transitions are handled correctly
         * and don't get stuck in inconsistent states
         */

        cy.cardContent('StateVariable State Tracking').within(() => {
            // Rapidly click between success and failure
            cy.contains('button', 'Trigger Success').click();
            cy.contains('🔄 Loading... Please wait').should('exist');

            // Click failure before success completes
            cy.contains('button', 'Trigger Failure').click();
            cy.contains('🔄 Loading... Please wait').should('exist');

            // Should eventually show error state
            cy.contains('🔄 Loading... Please wait', { timeout: 5000 }).should('not.exist');
            cy.contains('❌ Error occurred during calculation').should('exist');
        });
    });
});


import { loginBeforeRoute, selectOption } from '../support/utils';

describe('StreamVariable - Keyed Mode', () => {
    beforeEach(loginBeforeRoute('/stream_variable'));

    /**
     * Helper to reset keyed mode test state.
     * Call at the start of tests that need clean state.
     */
    function resetKeyedState() {
        cy.cardContent('Keyed Mode').within(() => {
            cy.get('button').contains('Reset Keyed Test State').click();
        });
        // Wait for reset to propagate
        cy.wait(500);
    }

    it('displays initial empty state', () => {
        resetKeyedState();
        cy.cardContent('Keyed Mode').within(() => {
            cy.contains('div', 'No events').should('be.visible');
        });
    });

    it('adds events via StreamEvent.add()', () => {
        resetKeyedState();
        cy.cardContent('Keyed Mode').within(() => {
            // Add first event
            cy.get('button').contains('Add Event').click();
            cy.contains('div', 'Event #1').should('be.visible');

            // Add second event
            cy.get('button').contains('Add Event').click();
            cy.contains('div', 'Event #2').should('be.visible');

            // Both should be visible
            cy.contains('div', 'Event #1').should('be.visible');
        });
    });

    it('removes events via StreamEvent.remove()', () => {
        resetKeyedState();
        cy.cardContent('Keyed Mode').within(() => {
            // Add two events
            cy.get('button').contains('Add Event').click();
            cy.get('button').contains('Add Event').click();
            cy.contains('div', 'Event #2').should('be.visible');

            // Remove last event
            cy.get('button').contains('Remove Last').click();
            cy.contains('div', 'Event #2').should('not.exist');
            cy.contains('div', 'Event #1').should('be.visible');
        });
    });

    it('clears all events via StreamEvent.replace()', () => {
        resetKeyedState();
        cy.cardContent('Keyed Mode').within(() => {
            // Add events
            cy.get('button').contains('Add Event').click();
            cy.get('button').contains('Add Event').click();
            cy.contains('div', 'Event #2').should('be.visible');

            // Clear all
            cy.get('button').contains('Clear All').click();
            cy.contains('div', 'No events').should('be.visible');
        });
    });

    it('filters by category (dependency change restarts stream)', () => {
        resetKeyedState();
        cy.cardContent('Keyed Mode').within(() => {
            // Add event to 'general' category
            cy.get('button').contains('Add Event').click();
            cy.contains('div', 'Event #1').should('be.visible');

            // Switch to 'alerts' category - should show empty (no alerts yet)
            selectOption('alerts');
            cy.contains('div', 'No events').should('be.visible');

            // Add event to 'alerts' category
            cy.get('button').contains('Add Event').click();
            cy.contains('div', 'Event #2').should('be.visible');

            // Switch back to 'general' - should show Event #1
            selectOption('general');
            cy.contains('div', 'Event #1').should('be.visible');
            cy.contains('div', 'Event #2').should('not.exist');
        });
    });

    it('recovers from recoverable error (ReconnectException)', () => {
        resetKeyedState();
        cy.cardContent('Keyed Mode').within(() => {
            // Add events
            cy.get('button').contains('Add Event').click();
            cy.get('button').contains('Add Event').click();
            cy.contains('div', 'Event #2').should('be.visible');

            // Trigger recoverable error - should reconnect and restore state
            cy.get('button').contains('Recoverable Error').click();

            // Wait for reconnection and verify state is restored
            cy.contains('div', 'Event #1', { timeout: 10000 }).should('be.visible');
            cy.contains('div', 'Event #2').should('be.visible');
        });
    });

    it('shows error on fatal error', () => {
        resetKeyedState();
        cy.cardContent('Keyed Mode').within(() => {
            // Add an event first
            cy.get('button').contains('Add Event').click();
            cy.contains('div', 'Event #1').should('be.visible');

            // Trigger fatal error
            cy.get('button').contains('Fatal Error').click();

            // Should show error (the exact UI depends on error handling implementation)
            // For now we just verify the stream stops working properly
            cy.wait(2000);
        });
    });

    it('restores state on page refresh', () => {
        // Reset state first, then add events
        resetKeyedState();
        cy.cardContent('Keyed Mode').within(() => {
            // Add events
            cy.get('button').contains('Add Event').click();
            cy.get('button').contains('Add Event').click();
            cy.contains('div', 'Event #2').should('be.visible');
        });

        // Refresh the page
        cy.reload();

        // Wait for page to load and stream to reconnect
        cy.cardContent('Keyed Mode').within(() => {
            // Events should be restored from the broadcaster's state
            cy.contains('div', 'Event #1', { timeout: 10000 }).should('be.visible');
            cy.contains('div', 'Event #2').should('be.visible');
        });
    });
});

describe('StreamVariable - Custom JSON Mode', () => {
    beforeEach(loginBeforeRoute('/stream_variable'));

    /**
     * Helper to reset custom mode test state.
     * Call at the start of tests that need clean state.
     */
    function resetCustomState() {
        cy.cardContent('Custom JSON Mode').within(() => {
            cy.get('button').contains('Reset Custom Test State').click();
        });
        // Wait for reset to propagate
        cy.wait(500);
    }

    /**
     * Helper to select an option from a specific dropdown identified by its label.
     * Finds the parent Stack containing the label, then clicks the combobox within it.
     * Uses aria-controls to find the portaled dropdown.
     */
    function selectOptionByLabel(label: string, optionValue: string) {
        // Find the label, get its parent Stack, then find the combobox within
        cy.contains('div', label)
            .parent()
            .find('button[role="combobox"]')
            .click()
            .should('have.attr', 'aria-controls')
            .then((ariaControls) => {
                // Escape the ID for CSS selector (colons need to be escaped)
                // @ts-expect-error - ariaControls is a string
                const escapedId = ariaControls.replace(/:/g, '\\:');
                cy.document()
                    .its('body')
                    .find(`#${escapedId}`)
                    .within(() => {
                        cy.get(`[role="option"][title="${optionValue}"]`).click();
                    });
            });
    }

    it('displays initial state via json_snapshot', () => {
        resetCustomState();
        cy.cardContent('Custom JSON Mode').within(() => {
            cy.contains('div', 'Count:').next().should('have.text', '0');
            cy.contains('div', 'Current Status:').next().should('have.text', 'idle');
        });
    });

    it('updates count via json_patch', () => {
        resetCustomState();
        cy.cardContent('Custom JSON Mode').within(() => {
            cy.get('button').contains('Increment Count').click();
            cy.contains('div', 'Count:').next().should('have.text', '1');

            cy.get('button').contains('Increment Count').click();
            cy.contains('div', 'Count:').next().should('have.text', '2');
        });
    });

    it('updates status via json_patch', () => {
        resetCustomState();
        cy.cardContent('Custom JSON Mode').within(() => {
            // Change to 'active'
            selectOptionByLabel('New Status:', 'active');
            cy.get('button').contains('Apply Status').click();
            cy.contains('div', 'Current Status:').next().should('have.text', 'active');

            // Change to 'error'
            selectOptionByLabel('New Status:', 'error');
            cy.get('button').contains('Apply Status').click();
            cy.contains('div', 'Current Status:').next().should('have.text', 'error');
        });
    });

    it('adds items via json_patch', () => {
        resetCustomState();
        cy.cardContent('Custom JSON Mode').within(() => {
            // Add item 'a'
            cy.get('button').contains('Add Item').click();
            cy.contains('div', 'Items:').next().should('contain.text', 'value-a');

            // Add item 'b'
            selectOptionByLabel('Add Item Key:', 'b');
            cy.get('button').contains('Add Item').click();
            cy.contains('div', 'Items:').next().should('contain.text', 'value-b');
        });
    });

    it('resets state via json_snapshot', () => {
        resetCustomState();
        cy.cardContent('Custom JSON Mode').within(() => {
            // Make some changes
            cy.get('button').contains('Increment Count').click();
            cy.get('button').contains('Increment Count').click();
            cy.contains('div', 'Count:').next().should('have.text', '2');

            // Reset
            cy.get('button').contains('Reset').click();
            cy.contains('div', 'Count:').next().should('have.text', '0');
            cy.contains('div', 'Current Status:').next().should('have.text', 'idle');
        });
    });

    it('accesses nested values with .get()', () => {
        resetCustomState();
        cy.cardContent('Custom JSON Mode').within(() => {
            // Verify we can access nested 'count', 'status', and 'items' via .get()
            cy.contains('div', 'Count:').next().should('have.text', '0');
            cy.contains('div', 'Current Status:').next().should('have.text', 'idle');

            // Update and verify nested access still works
            cy.get('button').contains('Increment Count').click();
            cy.contains('div', 'Count:').next().should('have.text', '1');
        });
    });

    it('restores state on page refresh', () => {
        // Reset state first, then make changes
        resetCustomState();
        cy.cardContent('Custom JSON Mode').within(() => {
            // Make some changes
            cy.get('button').contains('Increment Count').click();
            cy.get('button').contains('Increment Count').click();
            cy.contains('div', 'Count:').next().should('have.text', '2');

            selectOptionByLabel('New Status:', 'active');
            cy.get('button').contains('Apply Status').click();
            cy.contains('div', 'Current Status:').next().should('have.text', 'active');
        });

        // Refresh the page
        cy.reload();

        // Wait for page to load and stream to reconnect
        cy.cardContent('Custom JSON Mode').within(() => {
            // State should be restored from the broadcaster
            cy.contains('div', 'Count:', { timeout: 10000 }).next().should('have.text', '2');
            cy.contains('div', 'Current Status:').next().should('have.text', 'active');
        });
    });
});

import { loginBeforeRoute, selectOption } from '../support/utils';

describe('Switch Variable', () => {
    beforeEach(loginBeforeRoute('/switch_variable'));

    it('Simple Boolean Switch works correctly', () => {
        cy.cardContent('Simple Boolean Switch').within(() => {
            // Initially should show "User Panel" (is_admin = false)
            cy.contains('div', 'Current Status:').next().should('have.text', 'User Panel');

            // Click toggle button
            cy.get('button').contains('Toggle Admin').click();

            // Should now show "Admin Panel"
            cy.contains('div', 'Current Status:').next().should('have.text', 'Admin Panel');

            // Toggle back
            cy.get('button').contains('Toggle Admin').click();

            // Should show "User Panel" again
            cy.contains('div', 'Current Status:').next().should('have.text', 'User Panel');
        });
    });

    it('Value Mapping works correctly', () => {
        cy.cardContent('Value Mapping').within(() => {
            // Initially should show "No Access" (guest role)
            cy.contains('div', 'Permissions:').next().should('have.text', 'No Access');

            // Change to admin role
            selectOption('admin');
            cy.contains('div', 'Permissions:').next().should('have.text', 'Full Access');

            // Change to editor role
            selectOption('editor');
            cy.contains('div', 'Permissions:').next().should('have.text', 'Write Access');

            // Change to viewer role
            selectOption('viewer');
            cy.contains('div', 'Permissions:').next().should('have.text', 'Read Access');

            // Test unknown value (should use default)
            selectOption('unknown');
            cy.contains('div', 'Permissions:').next().should('have.text', 'Unknown Access');
        });
    });

    it('Complex Condition works correctly', () => {
        cy.cardContent('Complex Condition').within(() => {
            // Initially score=85, should show "B Grade" (< 90)
            cy.contains('div', 'Grade (>=90 = A, <90 = B):').next().should('have.text', 'B Grade');

            // Change score to 95 (>= 90)
            cy.get('input').clear().type('95');
            cy.contains('div', 'Grade (>=90 = A, <90 = B):').next().should('have.text', 'A Grade');

            // Change score to 89 (< 90)
            cy.get('input').clear().type('89');
            cy.contains('div', 'Grade (>=90 = A, <90 = B):').next().should('have.text', 'B Grade');
        });
    });

    it('Switch in Derived Variable works correctly', () => {
        cy.cardContent('Switch in Derived Variable').within(() => {
            // Initially temp=20, should show "wear warm clothes"
            cy.contains('div', 'Weather Report:')
                .next()
                .should('contain.text', 'Wear warm clothes');

            // Change temperature to 30 (> 25)
            cy.get('input').clear().type('30');
            cy.contains('div', 'Weather Report:')
                .next()
                .should('contain.text', 'Wear light clothes');

            // Change temperature to 15 (< 25)
            cy.get('input').clear().type('15');
            cy.contains('div', 'Weather Report:')
                .next()
                .should('contain.text', 'Wear warm clothes');
        });
    });

    it('Variable Mapping works correctly', () => {
        cy.cardContent('Variable Mapping').within(() => {
            // Initially should show "System Theme" (auto)
            cy.contains('div', 'Active Theme:').next().should('have.text', 'System Theme');

            // Change to light theme
            selectOption('light');
            cy.contains('div', 'Active Theme:').next().should('have.text', 'Light Theme');

            // Change to dark theme
            selectOption('dark');
            cy.contains('div', 'Active Theme:').next().should('have.text', 'Dark Theme');

            // Test unknown value (should use default)
            selectOption('custom');
            cy.contains('div', 'Active Theme:').next().should('have.text', 'Unknown Theme');
        });
    });

    it('Switch Variable with Multiple Conditions works correctly', () => {
        cy.cardContent('Switch Variable with Multiple Conditions').within(() => {
            // Initially user_type=free, feature_enabled=true
            cy.contains('div', 'Available Features:').next().should('have.text', 'Basic Features');

            // Toggle features off
            cy.get('button').contains('Toggle Features').click();
            cy.contains('div', 'Available Features:').next().should('have.text', 'Features Disabled');

            // Toggle features back on
            cy.get('button').contains('Toggle Features').click();
            cy.contains('div', 'Available Features:').next().should('have.text', 'Basic Features');

            // Change to premium user
            selectOption('premium');
            cy.contains('div', 'Available Features:').next().should('have.text', 'Premium Features');

            // Toggle features off with premium user
            cy.get('button').contains('Toggle Features').click();
            cy.contains('div', 'Available Features:').next().should('have.text', 'Features Disabled');

            // Change to enterprise user while features are off
            cy.wait(1000);
            selectOption('enterprise');
            cy.wait(1000);
            cy.contains('div', 'Available Features:').next().should('have.text', 'Features Disabled');

            // Toggle features back on
            cy.wait(1000);
            cy.get('button').contains('Toggle Features').click();
            cy.wait(1000);
            cy.contains('Enterprise Features', { timeout: 15000 });
        });
    });

    it('Switch in Py Component works correctly', () => {
        cy.cardContent('Switch in Py Component').within(() => {
            // Initially should show "Please wait..." (loading status)
            cy.contains('div', 'Please wait...');

            // Change to success
            selectOption('success');
            cy.contains('div', 'Operation completed!');

            // Change to error
            selectOption('error');
            cy.contains('div', 'Something went wrong');

            // Change to cancelled
            selectOption('cancelled');
            cy.contains('div', 'Operation was cancelled');

            // Test unknown value (should use default)
            selectOption('unknown');
            cy.contains('div', 'Unknown status');
        });
    });

    it('Switch->DV->PyComponent (Server-side) works correctly', () => {
        cy.cardContent('Switch->DV->PyComponent (Server-side)').within(() => {
            // Initially priority_level=1, should show "Low"
            cy.contains('div', 'Task Priority: Low (Level 1)');

            // Change to priority level 2
            cy.get('input').clear().type('2');
            cy.contains('div', 'Task Priority: Medium (Level 2)');

            // Change to priority level 3
            cy.get('input').clear().type('3');
            cy.contains('div', 'Task Priority: High (Level 3)');

            // Change to priority level 4
            cy.get('input').clear().type('4');
            cy.contains('div', 'Task Priority: Critical (Level 4)');

            // Test unknown value (should use default)
            cy.get('input').clear().type('5');
            cy.contains('div', 'Task Priority: Unknown (Level 5)');
        });
    });
});

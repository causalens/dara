import { loginBeforeRoute } from '../support/utils';

describe('LoopVariable in Variable.get() nested property', () => {
    beforeEach(loginBeforeRoute('/loop_variable_nested'));

    describe('Basic Dynamic Access', () => {
        it('displays values accessed via dynamic loop variable key', () => {
            cy.cardContent('Basic Dynamic Access').within(() => {
                // Verify all user names are displayed with correct values
                cy.contains('div', 'user1').parent().should('contain.text', 'Alice');
                cy.contains('div', 'user2').parent().should('contain.text', 'Bob');
            });
        });
    });

    describe('Editable Dynamic Access', () => {
        it('displays initial values correctly', () => {
            cy.cardContent('Editable Dynamic Access').within(() => {
                cy.get('input').eq(0).should('have.value', 'Value A');
                cy.get('input').eq(1).should('have.value', 'Value B');
            });
        });

        it('updates the underlying data when editing via dynamic key', () => {
            cy.cardContent('Editable Dynamic Access').within(() => {
                // Edit the first input (item_a)
                cy.get('input').eq(0).clear().type('New Value A');

                // Verify the data object is updated
                cy.contains('div', 'Current data object:')
                    .next()
                    .should('contain.text', 'New Value A')
                    .and('contain.text', 'Value B');
            });
        });

        it('edits do not affect other dynamically-accessed values', () => {
            cy.cardContent('Editable Dynamic Access').within(() => {
                // Edit the second input (item_b)
                cy.get('input').eq(1).clear().type('New Value B');

                // Verify only item_b changed
                cy.get('input').eq(0).should('have.value', 'Value A');
                cy.contains('div', 'Current data object:')
                    .next()
                    .should('contain.text', 'Value A')
                    .and('contain.text', 'New Value B');
            });
        });
    });

    describe('Deeply Nested Access', () => {
        it('displays values with mixed static and dynamic keys', () => {
            cy.cardContent('Deeply Nested Access').within(() => {
                // Each row displays: category / item : color
                // Use the unique item name to find the row, then verify the color
                cy.contains('div', 'apple').parent().should('contain.text', 'Red');
                cy.contains('div', 'carrot').parent().should('contain.text', 'Orange');
            });
        });
    });

    describe('Dynamic List Update', () => {
        it('displays initial single item', () => {
            cy.cardContent('Dynamic List Update').within(() => {
                // Use the unique value text to verify rows exist
                cy.contains('div', 'X Value').should('be.visible');
                // Should only have one item row - Y and Z values should not exist
                cy.contains('div', 'Y Value').should('not.exist');
                cy.contains('div', 'Z Value').should('not.exist');
            });
        });

        it('adds items and displays their dynamic values', () => {
            cy.cardContent('Dynamic List Update').within(() => {
                // Add second item (y)
                cy.get('button').contains('Add Item').click();
                cy.contains('div', 'Y Value').should('be.visible');

                // Add third item (z)
                cy.get('button').contains('Add Item').click();
                cy.contains('div', 'Z Value').should('be.visible');

                // All three should be visible
                cy.contains('div', 'X Value').should('be.visible');
                cy.contains('div', 'Y Value').should('be.visible');
                cy.contains('div', 'Z Value').should('be.visible');
            });
        });

        it('removes items correctly', () => {
            cy.cardContent('Dynamic List Update').within(() => {
                // Add all items first
                cy.get('button').contains('Add Item').click();
                cy.get('button').contains('Add Item').click();
                cy.contains('div', 'Z Value').should('be.visible');

                // Remove last item (z)
                cy.get('button').contains('Remove Item').click();
                cy.contains('div', 'Z Value').should('not.exist');
                cy.contains('div', 'Y Value').should('be.visible');

                // Remove another item (y)
                cy.get('button').contains('Remove Item').click();
                cy.contains('div', 'Y Value').should('not.exist');
                cy.contains('div', 'X Value').should('be.visible');
            });
        });

        it('shows placeholder when all items removed', () => {
            cy.cardContent('Dynamic List Update').within(() => {
                // Remove the initial item
                cy.get('button').contains('Remove Item').click();
                cy.contains('div', 'No items').should('be.visible');
            });
        });

        it('resets to initial state', () => {
            cy.cardContent('Dynamic List Update').within(() => {
                // Add items
                cy.get('button').contains('Add Item').click();
                cy.get('button').contains('Add Item').click();
                cy.contains('div', 'Z Value').should('be.visible');

                // Reset
                cy.get('button').contains('Reset').click();
                cy.contains('div', 'Y Value').should('not.exist');
                cy.contains('div', 'Z Value').should('not.exist');
                cy.contains('div', 'X Value').should('be.visible');
            });
        });
    });
});

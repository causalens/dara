/* eslint-disable import/prefer-default-export */

/* eslint-disable import/no-extraneous-dependencies */
import { HttpResponseInterceptor, RouteMatcher, StaticResponse } from 'cypress/types/net-stubbing';

/**
 * Helper method to intercept a specific API call and return a callback to send a response at a specific point.
 * Useful for testing loading states.
 *
 * @param requestMatcher matcher for the request
 * @param response optional specific response to send
 */
export function interceptIndefinitely(
    requestMatcher: RouteMatcher,
    response?: StaticResponse | HttpResponseInterceptor
): { sendResponse: () => void } {
    let sendResponse;
    const trigger = new Promise((resolve) => {
        sendResponse = resolve;
    });
    cy.intercept(requestMatcher, (request) => {
        return trigger.then(() => {
            request.reply(response);
        });
    });
    return { sendResponse };
}

/**
 * Ensure loading finished after clearing the input, otherwise sometimes the
 * test fails
 *
 * @param alias aliasto retrieve the input by
 * @param string string to input
 * @param checkLoading function to run to check whether loading has finished
 */
// eslint-disable-next-line @typescript-eslint/no-empty-function
export function type(alias: string, string: string, checkLoading: () => void = () => {}): void {
    cy.get(alias).clear();
    checkLoading();
    cy.get(alias).type(string, { delay: 10 });
    checkLoading();
}

const firstPage = '/a_home';

export const loginBeforeRoute = (path: string) => () => {
    cy.visit('/login');
    cy.location('pathname').should((url) => {
        expect(url.includes(firstPage) || url.includes(path)).eq(true);
    });
    cy.visit(path);
    cy.location('pathname').should('contain', path);
};

/**
 * Select an option from a Dara Select component (which uses portal'd popups)
 *
 * @param optionValue the value/title of the option to select
 */
export function selectOption(optionValue: string): void {
    cy.get('button[role="combobox"]').click();

    // Wait for the dropdown to appear and get the aria-controls attribute
    cy.get('button[role="combobox"]')
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

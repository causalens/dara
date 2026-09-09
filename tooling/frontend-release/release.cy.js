describe("packed release artifact", () => {
  it("renders the declared scenario and preserves state through HMR", () => {
    const scenario = Cypress.env("releaseCase");
    cy.visit("/login");
    cy.contains(scenario.text, { timeout: 30000 }).should("be.visible");
    if (scenario.kind === "counter") {
      cy.contains("button", "Count: 0").click();
      cy.contains("button", "Count: 1").should("be.visible");
    }
    if (scenario.edit) {
      cy.writeFile(scenario.edit.path, scenario.edit.contents);
      cy.contains("Edited widget", { timeout: 30000 }).should("be.visible");
      cy.contains("button", "Count: 1").should("be.visible");
    }
  });
});

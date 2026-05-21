import { DEFAULT_ISSUER, profileNames } from './profiles.mjs';

const [, , profileName, issuerArg] = process.argv;
const issuer = issuerArg ?? process.env.QA_OIDC_ISSUER ?? DEFAULT_ISSUER;

async function main() {
  if (!profileName) {
    console.log(`Usage: npm run profile -- <${profileNames().join('|')}> [issuer]`);
    const response = await fetch(`${issuer}/__qa/profile`);
    if (response.ok) {
      console.log(JSON.stringify(await response.json(), null, 2));
    }
    return;
  }

  const response = await fetch(`${issuer}/__qa/profile/${encodeURIComponent(profileName)}`, {
    method: 'POST',
  });

  const body = await response.json();
  if (!response.ok) {
    console.error(JSON.stringify(body, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(body, null, 2));
}

await main();

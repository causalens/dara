// eslint-disable-next-line import/no-extraneous-dependencies
import '@testing-library/jest-dom';
import { RecoilEnv } from 'recoil';

// disable duplicate atom key checking in tests, as we clear the registries between tests
// but recoil does not provide a way to clear the atoms in their internals, so the warnings are false positives
RecoilEnv.RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED = false;

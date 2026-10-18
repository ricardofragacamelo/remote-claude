// A deliberate violation: production composition importing the test engine of plan 28, B-43.
// `no-test-engine-in-production` must refuse this, wherever in `src/` it is written from.
export { TEST_ENGINE } from '../../../../../fakes/engine/test-engine';

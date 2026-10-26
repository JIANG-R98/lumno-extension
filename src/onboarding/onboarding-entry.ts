// The onboarding page's script, an ES module that runs once the markup is
// parsed: its React views, the in-page tab switcher, then the page itself.
// Its demo overlay is the overlay the worker injects into web pages, which
// the page loads as classic scripts before this one runs.
import './react/onboarding-islands-entry';
import '../shared/tab-switcher/tab-switcher';
import '../shared/tab-switcher/page-bridge';
import './onboarding';

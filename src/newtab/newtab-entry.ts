// New Tab's page script, an ES module that runs once the markup is parsed:
// its React views, the in-page tab switcher, then the page itself.
import './react/react-islands-entry';
import '../shared/tab-switcher/tab-switcher';
import '../shared/tab-switcher/page-bridge';
import './newtab';

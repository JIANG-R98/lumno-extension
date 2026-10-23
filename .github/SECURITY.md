# Security policy

Lumno runs on every page you visit and can read your tabs, bookmarks and
history, so we take reports about its security seriously.

## Supported versions

Security fixes go into the latest release, which the Chrome Web Store,
Microsoft Edge Add-ons and Firefox Add-ons deliver to every install. Older
versions are not patched.

## Reporting a vulnerability

Please do not report security problems in public issues, pull requests or
discussions.

Report them privately through GitHub instead: open
[Report a vulnerability](https://github.com/kubai087/lumno-extension/security/advisories/new)
on this repository's Security tab. If you cannot use GitHub, email
[i@kubai.design](mailto:i@kubai.design).

A useful report says:

- which Lumno version and browser (with its version) you tested;
- what an attacker can do, and what they need first (a malicious page, another
  extension, access to the device);
- the steps or a proof of concept that shows it.

We will confirm we received the report, keep you updated while we work on a
fix, and credit you in the release notes unless you prefer otherwise. Please
give us a reasonable time to ship the fix before you disclose the problem.

## Scope

In scope are this repository's code and the packages it builds for the
browser stores: for example a web page reading data Lumno holds, running script
in Lumno's pages, or abusing Lumno's permissions.

Out of scope are problems in the browsers themselves, in third-party sites that
Lumno links to or searches, and in the services listed in the
[privacy policy](https://lumno.kubai.design/privacy/), unless Lumno's use of
them causes the problem.

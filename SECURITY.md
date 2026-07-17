# Security policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately through GitHub's
[**Report a vulnerability**](https://github.com/chetanparab/sutra/security/advisories/new)
flow (Security → Advisories), or by email to the maintainer at
**chetan.r.parab@gmail.com** with the subject line `SECURITY: Sutra`.

Please include:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept if possible),
- affected version / commit,
- any suggested mitigation.

You can expect an acknowledgement within **72 hours** and a status update within
**7 days**. We ask that you give us a reasonable window to ship a fix before any
public disclosure (coordinated disclosure).

## Scope & notes

- Sutra is a client-side application. Agent-generated code in the demo is executed
  only inside a **sandboxed QuickJS-on-WebAssembly VM** with no access to the host
  filesystem, network, or process table.
- The project ships **no secrets**; there are no API keys, tokens, or credentials
  in the repository. Secret scanning and push protection are enabled — do not
  commit secrets.
- Dependencies are monitored via Dependabot and code is scanned with CodeQL on
  every push and pull request.

## Supported versions

This is a preview; security fixes are applied to the `main` branch. Tagged
releases are the recommended way to consume a known-good build.

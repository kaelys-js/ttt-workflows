# Security Policy

## Reporting a vulnerability

Please report security issues **privately** through GitHub's
[Report a vulnerability](https://github.com/kaelys-js/ttt-workflows/security/advisories/new)
form (Security → Advisories). Private vulnerability reporting is enabled on this
repository, so you can share the details without them being public.

Please do not open a public issue for a security problem.

When you report, include where you can:

- what the issue is and the impact you think it has,
- which skill and which script or file it affects,
- steps to reproduce, and a proof of concept if you have one.

You can expect an initial response within a few days. If a fix is warranted, it
ships as a normal versioned release and the advisory is published once the change
is out.

## Supported versions

Only the latest release receives fixes. The plugin auto-updates through the Claude
Code marketplace when its version is bumped, so staying current is the supported
path.

## Scope

`ttt-workflows` is a set of Claude Code skills — Node and shell scripts plus their
reference docs, packaged as a plugin, alongside a static marketing site. The skills
run locally inside the operator's Claude Code session. They are read-only by design:
`pr-review` never mutates a pull request, `sec-audit` is read-only until an explicit
human approval, and `trp` does nothing that writes before the operator approves a plan.

Any auth the skills use — a ClickUp token, a `gh`/`az` login — is supplied by the
operator and read from their own machine; nothing is sent to a server this project
controls. In scope: how the scripts handle those tokens, command construction and
injection surfaces in the scripts, the CI workflows, and the marketplace metadata.
Out of scope: vulnerabilities in Claude Code itself, in `gh`/`az`/`git`, or in the
third-party services the skills talk to (report those to their own maintainers).

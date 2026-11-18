# Changelog

## 1.0.2

- Documentation and test hardening release; no runtime behavior change.
- Added unit tests for the `options.env` fallback, the install-time
  `TypeError` guards, and disposer ownership; added an entry smoke test for
  `name` and `ctx.effect` (13 unit + 4 integration tests).
- Expanded both READMEs and AGENT.md with install/update, structure,
  troubleshooting, and credential-scrub wording.

## 1.0.1

- Verified against DSH `0.2.2-rc.3` on Windows Desktop. No plugin code change:
  the host-side launch path (`@deepseek-ai/dsh-host-open-in-app`) and the
  credential scrub (`@deepseek-ai/dsh-subprocess`) are byte-for-byte the same as
  in rc.2, and `node tools/doctor.mjs` still reports both the leak and the
  intercepted launch shape.

## 1.0.0

- Initial release: strip `ELECTRON_RUN_AS_NODE` from the environment copy handed
  to a detached GUI launch, so **Open in VS Code** and similar applications show
  their window. Verified against DSH `0.2.2-rc.2` on Windows Desktop.

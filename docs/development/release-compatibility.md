# Release compatibility checklist

1. Define the supported upgrade baseline. Currently the compatibility gate
   covers the unchanged v3.5.0 planner and plan validator. Keep old fixtures
   immutable and add new baselines when the supported upgrade range changes.
2. Check both directions of the update contract: the old installed updater
   must accept the new archive, and the new helpers must understand existing
   configurations and invocation arguments. A new allowlist in the candidate
   cannot authorize files rejected by the installed updater.
3. Run the full CI suite and build from a clean committed tree. The release
   builder tests the actual ZIP with the old planner before exposing it for
   signing. Do not bypass this gate or replace the baseline with current code.
4. Test an actual signed upgrade from the oldest supported version on a
   disposable server, including rollback, preserved configuration and Minecraft
   process continuity. The preflight gate is not a substitute for this test.
5. Keep online-update scope distinct from a full installer. If activation needs
   Minecraft script or service changes, state that requirement in release notes.
6. Sign and publish the tested commit with matching VERSION, tag, ZIP and
   manifest. Publish a new patch version for corrections; do not replace the
   contents of an already released version.

The v3.5.1 regression is retained as a negative test: adding the formerly new
helper must fail with the v3.5.0 updater. This prevents a test that merely
confirms the latest updater agrees with its own latest allowlist.

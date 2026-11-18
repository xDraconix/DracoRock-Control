# Immutable compatibility baseline

These two files are byte-for-byte copies of `system/usr-local-bin/` from
DracoRock Control v3.5.0, commit `aeef94f0f3003868b4ceb6a40db74bb707ada5fb`.
Their Git blob hashes are asserted by `tests/test_upgrade_compatibility.py`.
Do not update these fixtures when changing the current updater: they represent
the code already installed on users' servers.

The compatibility test executes the old planner and old plan validator against
the candidate's system files. Machine-specific PHP discovery and installed
planner ownership are simulated; the allowlist and validation code are unchanged.
This is a preflight compatibility test, not a full live upgrade or rollback test.

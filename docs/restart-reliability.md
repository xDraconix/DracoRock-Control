# Restart reliability

The service worker now follows systemd state across automatic retries. A failed
first start must not fail the panel job while `Restart=on-failure` is still
recovering. Restart success requires a new service invocation, so the old
running process cannot be mistaken for the completed restart. Explicit panel
start/restart requests reset the rate-limit budget; automatic retries stay bounded.

Before starting Bedrock, `bedrock-nethernet-check --wait-port` checks whether the configured
`server-port` can actually be bound on the dual-stack TCP address. It waits up
to 75 seconds for old listeners or TIME_WAIT connections to disappear. Merely
checking for a listening process is insufficient. The existing NetherNet
HTTP readiness check still runs after launch.

The console STOP grace period is 60 seconds, with a 65-second systemd timeout.
If STOP expires, thread wait states and I/O/memory pressure are logged before
systemd terminates the service. This limit cannot fix an underlying storage or
swap stall and may terminate a server that would eventually shut down cleanly.

Console output is retained in `/var/log/mcbedrock/console.log` with log rotation.
The installer updates the known SCREEN launch line without replacing custom
start logic. New installations use the updated start/stop templates.

Apply through the full installer to install the service configuration and
Minecraft scripts. The restricted online component updater intentionally does
not replace Minecraft scripts or service overrides. Installing these changes
does not restart Minecraft automatically. Existing custom overrides should be
checked with `systemctl cat mcbedrock`.

Validation: isolated service-state tests cover old-invocation rejection,
automatic recovery, terminal failure, clean stop and forced stop. Port tests
cover availability, TIME_WAIT retry, timeout and unrelated socket errors.
A live panel restart completed with a one-second stop, a 50-second wait for
port release, HTTP 200, and zero automatic restart attempts. A separate slow
shutdown accepted STOP immediately but took 65 seconds while threads waited
on I/O; that host/container issue remains outside this change.

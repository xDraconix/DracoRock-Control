# Optional world creation seed

The Worlds form accepts an optional seed (up to 128 printable characters).
The initial Minecraft setup form also accepts the same optional seed through
the existing setup worker. Older setup requests without a seed remain valid.
Both numeric and text seeds are passed as strings through JavaScript, JSON,
PHP and the existing `bedrock-world-manager create NAME [SEED]` helper. Large
numeric seeds are never converted to JavaScript numbers.

Preparing a new world atomically sets `level-name` and `level-seed` in
server.properties. Empty or omitted seeds explicitly clear any previous seed,
so Bedrock generates a random seed on the next manual start. World directories
are not created by the panel; existing worlds cannot be overwritten. Selecting
an existing world retains the existing settings and does not rewrite world data.

The PHP API rejects non-string seeds, and the privileged helper rejects
oversized values and control characters before any write. Existing callers
without the optional argument remain supported. No new privileged helper or
allowlist entry is introduced.

Bedrock's documented `level-seed` behavior:
https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/server-properties#level-seed

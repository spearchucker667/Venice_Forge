# Sync Troubleshooting

## Safe first checks

1. Pause sync on every device; pausing clears the in-memory passphrase.
2. Confirm every device points at the same user-approved folder and that the third-party folder client has finished copying files.
3. Resume with the same passphrase. A wrong passphrase or modified packet must fail authentication; do not delete the packet to hide the error.
4. Review Status and Copy Safe Diagnostics. Do not share passphrases, API keys, raw packet contents, or full local paths.
5. Keep an encrypted `.vfbackup` outside the live sync folder before recovery operations.

## Common conditions

- **Packets do not appear:** verify the external folder provider is running and has quota. Venice Forge does not upload directly to WebDAV or S3.
- **Authentication failure:** confirm the passphrase and device enrollment. Passphrases cannot be recovered.
- **Repeated packet delivery:** operation IDs are idempotent; repeated delivery should not duplicate committed state.
- **Conflicts:** divergent records are merged or preserved as conflict copies according to store policy. Do not manually edit encrypted packets.
- **Interrupted write:** startup cleanup removes abandoned temporary files; atomic rename prevents a partial packet from becoming authoritative.

To change a compromised or forgotten sync passphrase, create a new empty sync folder/new sync set from a trusted local copy, then re-enroll each device. In-place key rotation is not implemented.

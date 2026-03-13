# @votiverse/cli

Command-line interface for the Votiverse governance engine. Primary tool for development, testing, headless deployments, and authenticated access to remote instances.

## Commands (Phase 1)

```
votiverse init [--preset <name>]         Initialize instance
votiverse status                         Show instance status

votiverse config presets                 List governance presets
votiverse config show                    Show current configuration
votiverse config validate                Validate configuration

votiverse participant add <name>         Add a participant
votiverse participant list               List participants

votiverse event create --title <t> --issue <i> [--topic <t>]
votiverse event list                     List voting events

votiverse delegate set --source <s> --target <t> [--scope <topic>]
votiverse delegate list                  List active delegations

votiverse vote cast <issue-id> <choice> --participant <name>
votiverse vote tally <issue-id>          Show tally results
votiverse vote weights <issue-id>        Show weight distribution

votiverse events log [--tail <n>]        Show event log
```

## Dependencies

- `@votiverse/engine`
- `@votiverse/core`
- `@votiverse/config`
- `@votiverse/identity`
- `commander`

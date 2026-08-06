# Continuous Integration

Wits World uses Gitea Actions for continuous integration.

The workflow is defined in:

`/.gitea/workflows/ci.yml`

## Triggers

Continuous integration runs for:

- every push to the repository;
- every pull request targeting `main`.

## Runner

Jobs execute on the repository-scoped `witsworld-azure-runner`.

The runner is hosted on an Azure Ubuntu virtual machine and executes workflow jobs in Docker-isolated environments using the `ubuntu-latest` label.

## Jobs

### Repository formatting

Runs the repository-wide Prettier formatting check:

```bash
npm run format:check
```

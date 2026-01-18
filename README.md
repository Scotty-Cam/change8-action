# Change8 Dependency Check

A GitHub Action that analyzes dependency updates in your PRs for breaking changes and provides links to migration guides.

## Features

- 🔍 **Scans** `requirements.txt`, `package.json`, and `pyproject.toml`
- ⚠️ **Detects** breaking changes between versions
- 📖 **Links** to detailed migration guides
- 💬 **Posts** a helpful comment on your PR

## Usage

Add this workflow to your repository:

```yaml
# .github/workflows/change8.yml
name: Change8 Dependency Check

on:
  pull_request:
    paths:
      - 'requirements.txt'
      - 'package.json'
      - 'pyproject.toml'
      - '**/requirements.txt'
      - '**/package.json'

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - uses: Scotty-Cam/change8-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token for posting comments | Yes | - |
| `fail-on-breaking` | Fail the action if breaking changes are found | No | `false` |
| `change8-service-key` | Optional API key for authenticated access (provides higher rate limits) | No | - |

### Using an API Key

For higher rate limits and priority access, you can provide a Change8 service key:

```yaml
- uses: Scotty-Cam/change8-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    change8-service-key: ${{ secrets.CHANGE8_SERVICE_KEY }}
```

Alternatively, set the `CHANGE8_SERVICE_KEY` environment variable.

## Example Output

When a PR updates dependencies with breaking changes, the action posts a comment like:

> ## 🔄 Change8 Dependency Analysis
> 
> ### langchain: 0.2.0 → 1.0.0
> 
> ⚠️ **5 breaking change(s) detected**
> 
> | Issue | Fix |
> |-------|-----|
> | `ChatOpenAI` moved to `langchain_openai` | Update import path |
> | `predict()` removed | Use `invoke()` instead |
> 
> 📖 **[Full Migration Guide →](https://www.change8.dev/guides/langchain/migrating-to-1.0.0)**

## Supported Packages

This action works with any package tracked by [Change8](https://www.change8.dev/packages), including:

- LangChain, LangGraph
- Next.js, React
- Pydantic, FastAPI
- PyTorch, Transformers
- And many more...

## License

MIT

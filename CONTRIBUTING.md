# Contributing

## Development setup

1. Install Node.js 20 or newer and Google Chrome.
2. Run `npm ci`.
3. Copy `.env.example` to `.env` only when testing against an account.
4. Run `npm run verify` before opening a pull request.

## Pull requests

- Keep selectors and answer adapters focused on observed Pearson markup.
- Add a small local HTML fixture test for every new exercise type when practical.
- Preserve the fail-closed behavior: unsupported pages must stop and create diagnostics instead of being skipped.
- Never commit credentials, session data, screenshots, lesson content or files from `diagnostics/`.

## Bug reports

Include the error message, operating system, Node.js version and the relevant exercise type. Redact names, account identifiers, course data and answers from diagnostics before attaching them.

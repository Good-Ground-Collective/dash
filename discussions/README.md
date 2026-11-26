# Discussions

Each file is the starting point for one working session, not a spec. A file:

- states what has to be decided and why it matters now
- records what we already know, plus constraints carried over from the planning notes
- gives a starting recommendation, so the session has something to push against
- lists the questions to work through
- says what "done" looks like for the conversation

When a discussion is settled, write its decisions into GitHub issues in the Dash project, link them from the PR that deletes the file, and remove the file.

## Order

| # | Discussion | Blocks |
|---|---|---|
| 01 | [Identity: users, service accounts, passkeys](./01-identity-and-auth.md) | onboarding design, Mission Control |
| 02 | [Design direction](./02-design-direction.md) | every design session |
| 03 | [Design: onboarding flow](./03-design-onboarding.md) | slice 1 build |
| 04 | [GitHub integration](./04-github-integration.md) | slice 1 build, design of the GitHub views |
| 05 | [Stack and repo layout](./05-stack-and-repo.md) | any code |
| 06 | [Hosting and deploy](./06-hosting-and-deploy.md) | slice 1 ship |
| 10 | [Infrastructure as code](./10-infrastructure-as-code.md) | first deploy, DNS for the passkey domain |
| 07 | [Communication standards](./07-communication-standards.md) | slices 2 and 3 |
| 08 | [Agent heartbeats](./08-agent-heartbeats.md) | slice 2 |
| 09 | [Benches and the daemon](./09-benches-and-daemon.md) | slice 3 |

01–06 and 10 make up slice 1: Mission Control, auth, the web app, deploy, and the GitHub view. 07–09 can wait until slice 1 is under way.

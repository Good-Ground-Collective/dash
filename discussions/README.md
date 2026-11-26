# Discussions

Each file is the starting point for one working session, not a spec. A file:

- states what has to be decided and why it matters now
- records what we already know, plus constraints carried over from the planning notes
- gives a starting recommendation, so the session has something to push against
- lists the questions to work through
- says what "done" looks like for the conversation

When a discussion is settled, write its decisions into GitHub issues in the Dash project, link them from the PR that deletes the file, and remove the file.

## Order

Two tracks run side by side. Design doesn't wait on the stack, because mocks don't need code.

| Step | Discussion | Why here |
|---|---|---|
| ✓ | 01 Identity: concluded in #1 → build issues #11–#15 | |
| 2 | [02 Design direction](./02-design-direction.md) | Sets the visual language before any mock gets made. |
| 3 | [04 GitHub integration](./04-github-integration.md) | Decides what "Connect GitHub" means in onboarding and what slice 1 shows. |
| 4 | [03 Design: onboarding flow](./03-design-onboarding.md) | Needs 01, 02 and 04. The first real design iteration. |
| 5 | [05 Stack and repo layout](./05-stack-and-repo.md) | Mostly settled already (TS, Svelte, Go). Confirms libraries, such as the auth library from 01. |
| 6 | [06 Hosting and deploy](./06-hosting-and-deploy.md) + [10 Infrastructure as code](./10-infrastructure-as-code.md) | One session. Needed before the first deploy. Can run alongside 4 and 5. |
| later | [07 Communication standards](./07-communication-standards.md) → [08 Agent heartbeats](./08-agent-heartbeats.md) → [09 Benches and the daemon](./09-benches-and-daemon.md) | Slices 2 and 3. Start once slice 1 is building. |

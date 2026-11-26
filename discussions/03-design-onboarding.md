# 03 · Design: onboarding flow

## Why now
It's the first screen you'll touch and it exercises auth end to end. It's a good first design iteration.

## Depends on
[01](./01-identity-and-auth.md) for bootstrap, passkeys and recovery, and [02](./02-design-direction.md) for the visual language.

## Flow to design (strawman)
1. **First boot:** enter the setup token, or arrive from the admin magic link.
2. **Create your account:** display name and email, then register a passkey.
3. **Add a second passkey** (encouraged, skippable), or save recovery codes.
4. **Connect GitHub:** install the GitHub App or authorise OAuth (see [04](./04-github-integration.md)), then pick orgs and repos.
5. **Land on home:** an empty state that still feels useful (your PRs and review requests appear as soon as the sync lands).
6. **Later visits:** sign in with a passkey (conditional UI and autofill), and handle a lost passkey through the recovery route.

Also to sketch:
- the settings screens for passkeys (list, rename, remove) and connected accounts
- the service accounts screen (create, show the key once, revoke)

## Questions
1. Is there an invite flow for future users, or is it bootstrap only for now?
2. Is GitHub connection part of onboarding or optional afterwards?
3. Do service accounts belong in onboarding ("pair your first machine") or later?
4. What does the empty home show before anything is connected?

## Done when
The screens are mocked, iterated and approved, and they become build issues.

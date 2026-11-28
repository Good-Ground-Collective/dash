#!/usr/bin/env node
import { enableCompileCache } from 'node:module';

enableCompileCache();

const cli = await import('#src/cli/dash-hooks-command.js');

await cli.DashHooksCommand.main(process.argv.slice(2));

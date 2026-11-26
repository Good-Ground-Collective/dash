import { MissionControlStub } from './mission-control-stub.ts';

const [, , port = '59998', webOrigin = 'http://localhost:4320'] = process.argv;

new MissionControlStub({ webOrigin }).listen({ port: Number(port) });
console.log(`Mission Control stub on http://localhost:${port}`);

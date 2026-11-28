/** What one briefing snapshot keeps: how many items each section holds, how long free text may run, and the size the whole serialized digest may reach. */
export const briefingLimits = {
  initiatives: 10,
  epicsPerInitiative: 5,
  epicsKeptUnderPressure: 2,
  githubItems: 10,
  agents: 10,
  benches: 10,
  connections: 10,
  titleLength: 200,
  textLength: 300,
  nameLength: 100,
  agentWindowMilliseconds: 24 * 60 * 60 * 1000,
  budgetCharacters: 24_000,
} as const;

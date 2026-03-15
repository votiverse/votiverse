/**
 * Organization and assembly definitions.
 */

export interface AssemblyDef {
  key: string;
  name: string;
  organizationId: string;
  preset: string;
}

export const ASSEMBLIES: AssemblyDef[] = [
  {
    key: "greenfield",
    name: "Greenfield Community Council",
    organizationId: "org-greenfield-residents",
    preset: "TOWN_HALL",
  },
  {
    key: "osc",
    name: "OSC Governance Board",
    organizationId: "org-opensource-collective",
    preset: "LIQUID_STANDARD",
  },
  {
    key: "municipal",
    name: "Municipal Budget Committee",
    organizationId: "org-civic-innovation-lab",
    preset: "CIVIC_PARTICIPATORY",
  },
  {
    key: "youth",
    name: "Youth Advisory Panel",
    organizationId: "org-civic-innovation-lab",
    preset: "LIQUID_ACCOUNTABLE",
  },
  {
    key: "board",
    name: "Board of Directors",
    organizationId: "org-meridian-capital",
    preset: "BOARD_PROXY",
  },
];

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
    preset: "DIRECT_DEMOCRACY",
  },
  {
    key: "osc",
    name: "OSC Governance Board",
    organizationId: "org-opensource-collective",
    preset: "LIQUID_OPEN",
  },
  {
    key: "municipal",
    name: "Municipal Budget Committee",
    organizationId: "org-civic-innovation-lab",
    preset: "CIVIC",
  },
  {
    key: "youth",
    name: "Youth Advisory Panel",
    organizationId: "org-civic-innovation-lab",
    preset: "LIQUID_DELEGATION",
  },
  {
    key: "board",
    name: "Board of Directors",
    organizationId: "org-meridian-capital",
    preset: "REPRESENTATIVE",
  },
  {
    key: "maple",
    name: "Maple Heights Condo Board",
    organizationId: "org-maple-heights",
    preset: "LIQUID_DELEGATION",
  },
  {
    key: "riverside",
    name: "Riverside Community Center",
    organizationId: "org-riverside-community",
    preset: "CIVIC",
  },
];

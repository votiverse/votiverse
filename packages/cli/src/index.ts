/**
 * @votiverse/cli — Entry point
 *
 * Command-line interface for the Votiverse governance engine.
 */

import { Command } from "commander";
import { ConsoleOutput } from "./output.js";
import {
  cmdInit,
  cmdConfigPresets,
  cmdConfigShow,
  cmdConfigValidate,
  cmdParticipantAdd,
  cmdParticipantList,
  cmdEventCreate,
  cmdEventList,
  cmdDelegateSet,
  cmdDelegateList,
  cmdVote,
  cmdVoteTally,
  cmdVoteWeights,
  cmdEventsLog,
  cmdStatus,
} from "./commands.js";

const out = new ConsoleOutput();
const program = new Command();

program.name("votiverse").description("Votiverse governance engine CLI").version("0.1.0");

// Init
program
  .command("init")
  .description("Initialize a new Votiverse instance")
  .option("--preset <name>", "governance preset", "LIQUID_DELEGATION")
  .action(async (opts: { preset: string }) => {
    await cmdInit(opts.preset, out);
  });

// Status
program
  .command("status")
  .description("Show instance status")
  .action(async () => {
    await cmdStatus(out);
  });

// Config commands
const config = program.command("config").description("Configuration operations");

config
  .command("presets")
  .description("List available governance presets")
  .action(async () => {
    await cmdConfigPresets(out);
  });

config
  .command("show")
  .description("Show current configuration")
  .action(async () => {
    await cmdConfigShow(out);
  });

config
  .command("validate")
  .description("Validate current configuration")
  .action(async () => {
    await cmdConfigValidate(out);
  });

// Participant commands
const participant = program.command("participant").description("Participant management");

participant
  .command("add <name>")
  .description("Add a participant")
  .action(async (name: string) => {
    await cmdParticipantAdd(name, out);
  });

participant
  .command("list")
  .description("List all participants")
  .action(async () => {
    await cmdParticipantList(out);
  });

// Event commands
const event = program.command("event").description("Voting event management");

event
  .command("create")
  .description("Create a voting event")
  .requiredOption("--title <title>", "event title")
  .requiredOption("--issue <issue>", "issue title")
  .option("--topic <topic>", "topic name")
  .action(async (opts: { title: string; issue: string; topic?: string }) => {
    await cmdEventCreate(opts.title, opts.issue, opts.topic, out);
  });

event
  .command("list")
  .description("List voting events")
  .action(async () => {
    await cmdEventList(out);
  });

// Delegate commands
const delegate = program.command("delegate").description("Delegation management");

delegate
  .command("set")
  .description("Create a delegation")
  .requiredOption("--source <name>", "delegating participant")
  .requiredOption("--target <name>", "delegate")
  .option("--scope <topic>", "topic scope")
  .action(async (opts: { source: string; target: string; scope?: string }) => {
    await cmdDelegateSet(opts.source, opts.target, opts.scope, out);
  });

delegate
  .command("list")
  .description("List active delegations")
  .action(async () => {
    await cmdDelegateList(out);
  });

// Vote commands
const vote = program.command("vote").description("Voting operations");

vote
  .command("cast <issue-id> <choice>")
  .description("Cast a vote")
  .requiredOption("--participant <name>", "voting participant")
  .action(async (issueId: string, choice: string, opts: { participant: string }) => {
    await cmdVote(issueId, choice, opts.participant, out);
  });

vote
  .command("tally <issue-id>")
  .description("Show vote tally")
  .action(async (issueId: string) => {
    await cmdVoteTally(issueId, out);
  });

vote
  .command("weights <issue-id>")
  .description("Show weight distribution")
  .action(async (issueId: string) => {
    await cmdVoteWeights(issueId, out);
  });

// Events log
program
  .command("events")
  .description("Event log operations")
  .command("log")
  .description("Show event log")
  .option("--tail <n>", "show last N events", "0")
  .action(async (opts: { tail: string }) => {
    await cmdEventsLog(parseInt(opts.tail, 10), out);
  });

export { program };

// Run if executed directly
program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});

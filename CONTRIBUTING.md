# Contributing to Votiverse

Thank you for your interest in Votiverse. This project is in its early specification phase, and thoughtful contributions can shape its direction significantly.

## What We Need Most Right Now

Votiverse is currently a **specification and design project**, not a codebase. The most valuable contributions at this stage are:

**Critique and analysis.** Read the [whitepaper](docs/papers/paper-i-whitepaper.md) and challenge it. Where does the model break? What failure modes are missing? What assumptions are wrong? A strong specification is built by finding its weaknesses early.

**Governance model extensions.** The whitepaper defines five primitives (direct vote, delegation, topic scope, revocability, transitivity). Are there primitives we're missing? Are there governance configurations that the current model can't express?

**Real-world scenarios.** Describe a specific organization or community you know and how Votiverse would (or wouldn't) work for them. Concrete use cases expose gaps that abstract reasoning misses.

**Research connections.** If you know of relevant academic work, existing platforms, or historical precedents that the project should engage with, open an issue or submit a pull request to the research documents.

**Writing and editing.** The whitepaper is a living draft. Improvements to clarity, structure, and argument are welcome.

## How to Contribute

### Issues

Open a GitHub issue for:

- Questions about the governance model
- Critiques or identified weaknesses
- Proposals for new features or mechanisms
- Links to relevant research or related projects

Use a clear, descriptive title. Include enough context for others to engage with your point.

### Pull Requests

For contributions to documents:

1. Fork the repository.
2. Create a branch with a descriptive name (e.g., `improve-cycle-resolution`, `add-quorum-analysis`).
3. Make your changes.
4. Submit a pull request with a clear description of what you changed and why.

For substantial changes to the whitepaper or governance model, consider opening an issue first to discuss the direction before investing time in a full draft.

## What We're Not Ready For Yet

**Code contributions.** There is no implementation yet, and that is intentional. The specification needs to stabilize before building begins. If you're eager to prototype, that's welcome — but please coordinate through an issue first so we can discuss scope and approach.

**Visual design or branding.** The project doesn't have a website or visual identity yet. This will come, but it's not the priority at this stage.

## Principles for Contribution

**Be honest.** If you think something in the design is wrong, say so directly. Constructive criticism is the most valuable form of contribution.

**Be specific.** "I don't think this would work" is less useful than "Here's a scenario where delegation chains produce a bad outcome, and here's why the proposed mitigation doesn't address it."

**Be respectful.** Disagree with ideas, not people. This project attracts people with strong opinions about governance — that's a feature, not a problem, as long as the discourse stays productive.

## License

By contributing to this repository, you agree that your contributions will be licensed under the [Creative Commons Attribution-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-sa/4.0/), consistent with the project's LICENSE file.

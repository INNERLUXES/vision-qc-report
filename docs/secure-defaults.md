# Secure defaults

The default run is the safe run. Nothing in the first section needs a flag, and none of it can be switched off. The rest of the
document is about what the tool cannot do for you: which files you give it, where the output goes, and who may change the files
it reads. A clean result is a pair of files with none of the problems the checks look for and rates within the limits that were
set, not a finding that a station is good: the tool is arithmetic on the pass and fail results of a station and the labels of the
same parts, it never looks at an image, and it is not a measurement system analysis or a certification.

## How the tool behaves by default

- **Never an image, never a key.** The tool needs no API key, no address of a server and no account, and has no option to take
  one. It cannot fetch an image, because it has no code that reaches the network and no code that reads an image.
- **Reads, never writes.** The tool reads the two files it is given. It follows no symbolic link, fetches no URL, refuses an
  argument that looks like an address, contacts nothing over the network, evaluates nothing, runs no program and writes nothing
  to disk.
- **Keys and seeds are never echoed.** A column named for a key or a seed, and a cell shaped like a mnemonic or a private key, is
  reported by its place, and its value is never put in a text, markdown, JSON, SARIF or JUnit report or in an error message. The
  cell is read as empty.
- **Every check on from the first run.** A file the reader cannot follow, an unknown or repeated column, a row that cannot be
  read, a label or a verdict that is not one of the two, a part with only one side, runs out of order, a secret, an escape rate,
  a false reject rate or a repeatability that breaks its limit are errors; an optional column that is missing, a defect with no
  type, labelers who disagree and a small sample are warnings. There is no configuration file of the tool that could set a check
  off.
- **No row is skipped without a word.** A row that is left out is an error finding at its line and is counted in the summary,
  and the run fails at the default `--fail-on` of `error`. A file past a limit of size or rows is refused; it is never read in
  part.
- **Fail closed on what cannot be measured.** A limit on a rate with nothing to divide by is not met. When a file cannot be read,
  no rate is worked out, the limits are reported as not evaluated, and the run fails.
- **No clock.** The tool reads no date and no time. The same files and options give the same report on every day, and the JUnit
  report records every time as 0.
- **Exact rates.** A rate is two whole numbers; the comparison with a limit is exact and a rate is rounded only when it is
  shown.
- **Unknown arguments are errors.** An option the tool does not know, a value that looks like an option and an option given twice
  stop the run, so a typo such as `--fail-no` cannot leave a default in place. A limit that is not a plain number in its range is
  refused.
- **No pattern from the input.** No regular expression is built from a file or from an argument.
- **Bounded work.** The reader has limits of size, rows, columns, cells and cell length, the rows are grouped by a counting sort,
  and no function calls itself (docs/limits.md), so a large or hostile file cannot exhaust the stack, the memory or the time.
- **No prototype tricks.** Names from the files are kept in maps and sets, never set as properties of an object, so `__proto__` is
  only a name.
- **Clean output.** Text from the input, file names, part ids and defect types included, has control characters, line separators
  and direction controls replaced and its length capped before it reaches a report or an error message; the markdown report also
  escapes what markdown gives a meaning to, and the JUnit report holds no text from the input at all.
- **No dependencies.** Node 22 or newer and nothing else.

## Settings that make the check stricter

- **`--fail-on warning`.** A small sample, labelers who disagree, a defect with no type and a missing optional column fail the run
  too. Use it on the set that is about to gate a release, and record each warning the team keeps on purpose.
- **`--max-escape`, `--max-false-reject` and `--min-repeatability`.** Set them from what an escape and a false reject cost the
  line. A `--max-escape` of 0 means that one escape in the set fails the run.
- **`--min-defects` and `--min-good`.** Ask for the sample size the acceptance needs.
- **Whole sets.** Check the whole set at once; a set cut in the middle changes the rates.

## Running it in a pipeline

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@<full commit hash> # vX.Y.Z
  - uses: actions/setup-node@<full commit hash> # vX.Y.Z
    with:
      node-version: 22
  - name: Check the station against the labelled set
    run: npx --yes github:INNERLUXES/vision-qc-report station/labels.csv station/results.csv --max-escape 1 --format junit > station/junit.xml
```

- Give the job read access to the contents and nothing more. The tool needs no secret, no API key and no access to a server;
  never give it one.
- Pin every action to a full commit, as above, and pin the tool to a release commit or a tag you have read, because `npx`
  runs what it downloads.
- Run the station in a step of its own, with its own access, and save its verdicts to the file. This tool only reads the files.
- Check the exact files that the next step uses. Files edited after the check are not what was checked.
- Keep the files out of public repositories if the part ids or the notes point at your customers or your drawings. Keep the
  reports with the same care, because a finding quotes part ids, defect types and notes of the files.
- Do not hide the exit code with a trailing `|| true`. To keep the report without failing, keep `--fail-on` at `error` and keep
  the JUnit, SARIF or JSON report as an artifact of the job.
- Treat a report built from files you do not trust as untrusted data.
- If the tool reports `secret-in-file` and the value is real, treat it as exposed: remove it from the file and from every place
  the file was copied to, and move what it controls to a new key. The tool does not show the value, but the file itself was
  readable to everyone with access to it.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline and before every release, with `ssdf-repo-check`
pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries, the SSDF gate in ci.yml and release.yml |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS with Node 22 and 24, `npm run test:coverage`, hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |

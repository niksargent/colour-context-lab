# Colour Context Lab

A local, dependency-free experiment for measuring whether contextual framing changes an OpenAI model's stated favourite colour.

## Run it

Requires Node.js 18 or newer.

```powershell
npm start
```

Open `http://localhost:4173`, enter an OpenAI API key, choose a model and sample size, then select the contexts to test. The key is retained only in the browser field and the server's memory while the run is active; it is never written to disk.

## Experimental design

- 45 pre-registered contexts in nine families: baseline, name, country, persona, environment, memory, activity, weather, and abstract association.
- Every observation is a new Responses API request. There is no shared conversation, `previous_response_id`, or cross-trial state.
- The context and question are sent together once. Request order is randomised by default.
- Responses use a strict schema containing one colour name and one best-fit sRGB hex value.
- Expected influence and direction are hypotheses recorded in the dataset before observations, not labels inferred from results.
- The UI reports raw distributions, family breakdowns, and total variation distance from the baseline family. For serious comparison, use equal sample sizes and include baseline contexts.

This probes model behaviour under prompts. It does not measure human preferences or establish cultural facts.
## Colour Atlas analytics

The Colour Atlas combines successful observations from one run or every run using the same exact question. Its linked views include generated evidence-backed findings, a family/context colour heat map, baseline-distance versus diversity scatter, effective-colour rankings, a context consistency ladder, a Lab perceptual colour field with dot and density modes, and a drill-down microscope exposing the full prompt, exact vocabulary, broad hues, hypotheses, and run-to-run traces.

All metrics are calculated locally from the JSONL observations. Broad-hue analysis derives a hue family from the recorded sRGB hex while preserving the raw model label and hex unchanged. Baseline distance uses total variation distance; diversity is displayed as the effective number of equally likely colours (`2^Shannon entropy`).

## Data

- `data/contexts.json` is the standalone context dataset and methodology note. Edit it directly to add, remove, or revise contexts.
- `data/results/<run-id>.json` stores non-secret settings and progress metadata.
- `data/results/<run-id>.jsonl` stores one self-contained observation per line and is appended after every request, so completed observations survive interruption.

The server caps any single run at 2,000 requests. Result files are git-ignored by default to avoid accidentally committing research data. Download any run's JSONL from the Results view.

## Checks

```powershell
npm run check
```

This checks both JavaScript files and validates dataset IDs, required fields, influence bands, and the 50-context cap.

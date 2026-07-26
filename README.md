# Colour Context Lab

> **How far can a few words move a machine’s favourite colour?**

Colour Context Lab is an open-ended behavioural experiment for exploring how context changes an AI model’s answer to one deceptively simple question:

> *What’s your favourite colour?*

Run the question repeatedly through the OpenAI API, place each observation inside a different persona, place, memory, activity, weather condition or abstract idea, and watch a seemingly stable answer fracture into a vivid landscape of learned associations.

The experiment runner keeps every trial independent. The **Colour Atlas** then turns the resulting observations into an explorable research story—from the overall pull of the baseline down to the exact wording and colour vocabulary produced by an individual context.

## The idea

An LLM does not possess a favourite colour in the human sense. But when it is required to choose one, its answer is not necessarily arbitrary. It may reflect statistical regularities learned from language: blue and trust, red and urgency, green and renewal, white and snow, or less obvious associations embedded in names, places and imagined situations.

That makes “favourite colour” a useful behavioural probe. The output is small, legible and visual, while the influences behind it can be surprisingly deep.

The project asks:

- Does the model have a strong baseline answer when no meaningful context is supplied?
- Can unrelated contextual framing move it away from that baseline?
- Which context families create the largest shift?
- Which individual prompts produce consistent effects, and which create uncertainty?
- Does the result change in exact vocabulary while remaining inside the same broad hue?
- Do the effects reproduce across independent runs?

## Hypothesis

**Context will systematically shift the model’s colour-choice distribution away from its baseline distribution.**

The strength and consistency of that shift should depend on the semantic associations activated by the context. Highly colour-salient contexts—weather, landscape, sensory activity and symbolic concepts—should generally produce larger or more directional effects than low-salience controls such as generic names or routine situations.

The dataset records an expected influence band and directional hypothesis before observations are collected. Those expectations are not treated as ground truth: the interesting results include both confirmations and surprises.

## What you can do

### Design and run an experiment

- Choose an OpenAI model or enter a custom model ID.
- Control iterations per context, reasoning effort and request concurrency.
- Select individual contexts, entire families or a balanced starter set.
- Edit the colour question while keeping it identical across the selected trials.
- Randomise request order to reduce order and timing effects.
- Monitor progress and stop a run safely.

Every observation is a new Responses API request. Trials have no shared conversation history, no `previous_response_id` and no knowledge of any other test.

### Explore the context dataset

The included dataset contains **45 pre-registered contexts across nine families**:

| Family | What it probes |
|---|---|
| Baseline | Empty and deliberately low-salience controls |
| Name | Whether a name alone activates associations |
| Country | Geographic, landscape, flag and cultural-language associations |
| Persona | Richer combinations of profession, place, age and interests |
| Environment | Immediate physical and sensory surroundings |
| Memory | Autobiographical and emotional framing |
| Activity | Recently completed actions and experiences |
| Weather | Visually and seasonally suggestive conditions |
| Abstract | Symbolic concepts such as trust, urgency and renewal |

Contexts, hypotheses, expected directions and tags live in [`data/contexts.json`](data/contexts.json), separate from the interface and ready for manual or programmatic analysis.

### Get lost in the Colour Atlas

The Colour Atlas analyses one run or pools every run using the same exact question. Its linked views include:

- Automatically generated, evidence-backed findings
- A family-to-context colour map with glow, proportional-bar and proportional-dot modes
- Broad-hue and exact-label analysis modes
- Baseline-distance versus diversity scatterplots
- Effective-colour family rankings
- A context consistency ladder
- A perceptual Lab colour field with dot and density views
- Run, model and requested-reasoning filtering
- Direct model or reasoning-setting comparisons with matched-context divergence rankings
- A context microscope containing the full prompt, hypothesis, exact colour distribution, broad hues and run-to-run trace

Opening the Atlas automatically refreshes its data without reloading the browser or clearing the API key field.

Promising effects, evidence grades and follow-up experiments are tracked in [`RESEARCH_FINDINGS.md`](RESEARCH_FINDINGS.md).

## Experimental design

The design favours a compact, interpretable first experiment rather than an enormous prompt sweep.

1. Select a set of contexts and a number of repetitions.
2. For each repetition, create a completely independent API request.
3. Supply the context once, followed by the same colour question.
4. Require a structured response containing one colour label and one best-fit six-digit sRGB value.
5. Append the completed observation immediately to JSONL.
6. Compare the resulting distributions with the baseline and with one another.

The default balanced preset provides two contexts from every family. Larger runs can use the full dataset, while the server caps a single run at 2,000 requests to guard against accidental cost.

### Measurements

The application preserves three related representations rather than forcing every response into one category:

```text
Raw response        Normalised exact label        Broad hue
“midnight blue”  →  “midnight blue”           →  blue
```

Key measurements include:

- **Baseline distance:** total variation distance between two colour distributions
- **Exact-label diversity:** variation in the model’s chosen colour vocabulary
- **Broad-hue diversity:** variation after perceptually related shades are grouped
- **Effective colour count:** `2^Shannon entropy`, expressed as the equivalent number of equally likely colours
- **Dominance:** the share held by the most common answer
- **Consistency:** whether a context produces the same colour across repetitions and runs

## Run locally

### Requirements

- Node.js 18 or newer
- An OpenAI API key with access to the model you select

No package installation is required; the application uses Node’s built-in HTTP server and browser-native JavaScript.

```powershell
npm start
```

Open [http://localhost:4173](http://localhost:4173), enter your API key, choose a model and configure a run.

Run the project checks with:

```powershell
npm run check
```

The checks validate the server and browser JavaScript, required dataset fields, unique context IDs, influence bands and the 50-context dataset cap.

## Data and privacy

The API key is held only in the browser field and in server memory while a run is active. It is never written to disk or included in result files.

Each run creates two local files:

```text
data/results/<run-id>.json     Run settings and progress metadata
data/results/<run-id>.jsonl    One self-contained observation per line, including requested model and reasoning effort
```

JSONL is appended after every completed request, so observations already collected survive interruption. Result files are deliberately excluded by [`.gitignore`](.gitignore); the repository tracks the experiment design and contexts, not private API outputs.

Runs can also be downloaded from the Results interface for analysis elsewhere.

## Repository structure

```text
data/
  contexts.json          Standalone context dataset and hypotheses
  results/               Local, git-ignored observations
public/
  index.html             Application structure
  styles.css             Core interface design
  app.js                 Experiment and Results behaviour
  analytics.css          Colour Atlas presentation
  analytics.js           Analytics, visualisations and drill-down
scripts/
  validate-contexts.js   Dataset validation
server.js                Local server, OpenAI runner and data API
```

## Responsible interpretation

This is an exploratory study of **model behaviour under controlled prompts**. It does not measure human colour preferences, prove that a model has subjective experiences, or establish facts about cultures, countries, names or professions.

Observed effects can reflect training-data associations, prompt wording, model version, sampling behaviour, response normalisation and unequal sample sizes. Comparisons are strongest when they:

- Include baseline observations
- Use equal repetitions across compared contexts
- Keep the question and model settings fixed
- Distinguish exact-label variation from genuine hue variation
- Reproduce effects across multiple independent runs
- Report observation counts alongside rankings and findings

The surprising part is not that a model can associate snow with white or urgency with red. It is how consistently, subtly and sometimes unexpectedly a few words can reshape the answer to an otherwise identical question.

## Extending the experiment

The data-first structure is designed for extension. Possible next steps include:

- Alternative context datasets or languages
- Multiple phrasings of the same question
- Temperature or sampling experiments where supported
- Formal confidence intervals and resampling tests
- Exportable research reports and reproducible analysis notebooks

If you create a new context set, keep the hypotheses in the dataset and record them before examining the corresponding results. That separation is part of what makes the experiment interesting.

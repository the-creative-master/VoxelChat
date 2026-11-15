# The VoxelChat model folder

This is where VoxelChat keeps its models.

**In the packaged app this folder already contains
`smollm2-1.7b-instruct-q4_k_m.gguf` (1.05 GB).** The weights travel with the
app – VoxelChat never downloads a model while it runs.

## What lives here

| File | What it is |
| --- | --- |
| `smollm2-1.7b-instruct-q4_k_m.gguf` | SmolLM2 1.7B Instruct, Q4_K_M – the model VoxelChat ships with. |

* SHA-256: `decd2598bc2c8ed08c19adc3c8fdd461ee19ed5708679d1c54ef54a5a30d4f33`
* Upstream: [`HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF`](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF)
  (revision `2d4a76a30b4af41ecd395c35725ac11688d4cfe4`), Apache-2.0.

## Adding your own model

Drop any other `.gguf` file in here. VoxelChat picks it up automatically and
it shows up in the model picker – no restart, no configuration.

Bigger models are better at reasoning, smaller ones are faster. The picker
marks the bundled model as the recommended one.

## Why the files are not in git

The model is 1.05 GB and GitHub refuses files above 100 MB. The app builder
(`npm run build:app`) copies the weights into the packaged app folder, and the
release workflow publishes them as a release asset.

## For a fresh checkout

```bash
npm run prepare-model
```

The weights come from VoxelChat's own release. Pass `--allow-huggingface` if
you would rather pull them from the upstream repository while building.

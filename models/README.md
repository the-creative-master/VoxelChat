# VoxelChat models

This folder is VoxelChat's model store. Every `.gguf` file in here is picked
up automatically and shows up in the model picker (sidebar → model card).

* **Nothing here yet?** VoxelChat fetches **SmolLM2 1.7B Instruct (Q4_K_M)**
  for you on the first launch – the progress shows up in the browser and the
  file lands in this folder. After that, VoxelChat works fully offline.
* **Want a different model?** Drop any `.gguf` file in here (for example
  `Llama-3.2-1B-Instruct-Q4_K_M.gguf`) and it is available immediately.
* **Disk space?** SmolLM2 1.7B in Q4_K_M is roughly 1.1 GB.

The folder itself is git-ignored – your models stay on your machine.

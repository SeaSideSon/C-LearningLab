# C LearningLab

**Understand what your code does, one step at a time.**

C LearningLab is an interactive learning website for students exploring C programming, shell commands, Git, algorithms, and data structures. It combines a module learning map, beginner-friendly explanations, and visual code simulations to make abstract concepts easier to follow.

The idea is simple: read a line, predict what will happen, execute one operation, and compare the state before and after.

## What is inside?

The current curriculum contains **122 learning entries**, **78 representative demonstrations**, and **1,833 execution steps**, organized around these subjects:

- **Getting started:** C project structure and the edit–compile–run workflow.
- **Shell and Git:** commands, files, searching, version control, and repository workflows.
- **Imperative programming:** variables, conditions, loops, character arithmetic, functions, and recursion.
- **Memory management:** addresses, pointers, dereferencing, strings, allocation, ownership, and command-line arguments.
- **Data structures:** function pointers, structures, and records.
- **Compilation and preprocessing:** macros, headers, the compilation pipeline, and Libft concepts.
- **System interface:** file descriptors, file operations, and input/output.
- **Dynamic data structures:** linked lists, binary trees, and tree traversals.
- **Rushes:** Square, Sky Scraper, and Rosetta Stone concepts, including visibility constraints and backtracking.

Each module connects its exercises to earlier ideas and explains why those skills matter. Explicitly stated assignment goals and requirements are labeled separately from the project's interpretation of what an exercise teaches.

## How the simulations work

Choose a module, an exercise, and a concept demonstration. Then use **Next step** to advance one operation at a time.

The synchronized views show:

- **Source code:** the line associated with the current operation.
- **State and memory:** variables, types, values, illustrative addresses, and relevant workspace objects.
- **Pointer relationships:** which object an address reaches and how dereferencing accesses it.
- **Function calls:** active calls, waiting calls, parameters, and local objects.
- **Step companion:** what happened, why it happened, and what to observe.
- **Before → After:** significant changes to stored values and state.
- **Terminal output:** text produced up to the current execution step.

**Blue marks changed storage; amber marks reads.** The highlighted operation has already executed, and the displayed state shows its result. **Back** restores the previous step.

You can also restart, seek along the timeline, or use optional playback with adjustable pace. Small **(?)** buttons explain each section through hover, keyboard focus, or tapping. Personal notes and exploration progress are saved in your browser.

## Optional local AI tutor

The **Ask about this step** panel sits below the terminal. It uses **Qwen2.5-Coder-1.5B-Instruct** through **WebLLM** to generate answers on your own device.

- No paid inference API, API key, or AI subscription is required.
- The model loads only when you choose **Load local model**.
- The first download is approximately **0.9 GB**, plus runtime and tokenizer files.
- A WebGPU-compatible browser and roughly **2 GB of available GPU memory** are needed.
- Each question includes a snapshot of the current step, nearby code, memory changes, and output.
- Replies retain their original step labels if you continue stepping through the example.
- Chat is kept in the current tab and clears when you reload. **Release model** frees its live GPU resources.

The tutor is optional. Its answers can be wrong, so compare them with the simulator, your code, and the assignment. Real GPU inference and performance depend on your browser and hardware; automated chat tests use controlled adapters rather than validating model answer quality.

## Run the website locally

The website uses HTML, CSS, JavaScript modules, and JSON. The static app does not need a build step.

Clone the repository and serve the static app:

```bash
git clone https://github.com/SeaSideSon/C-LearningLab.git
cd C-LearningLab
python3 -m http.server 8000 --directory dist
```

Open **http://localhost:8000** in your browser. Serve the app through localhost or HTTPS rather than opening `index.html` directly.

## A few useful distinctions

These are **predefined teaching simulations**, not a general-purpose C interpreter. Representative examples isolate concepts and may use helper functions outside an exercise's submission restrictions. Check your assignment before adapting an example.

Addresses are illustrative. Integer-array examples use 4-byte integers in the teaching model; real C pointer arithmetic follows the size of the pointed-to type.

Original school assignment PDFs are kept separate from the public code export. Source-PDF links and the full curriculum validation script require your own matching copies in `dist/sources/`.

## Explore the code

| Location | Contents |
| --- | --- |
| `dist/` | Website, simulator logic, lesson data, styles, and local chat |
| `dist/curriculum.json` | Module and exercise learning content |
| `dist/vendor/` | Pinned WebLLM runtime and third-party notices |
| `tests/` | Simulation, C output, UI-handler, and chat-controller checks |

The test scripts require Node.js. C compilation checks also require a C compiler available as `cc`. The full curriculum validator additionally checks the original PDF files.

```bash
node tests/validate.mjs
node tests/local-chat-validate.mjs
# With the matching source PDFs available:
node tests/course-validate.mjs
```

## Learning together

Corrections, clearer explanations, new demonstrations, and accessibility improvements are welcome. When reporting a problem, include the **module, exercise, demonstration, and step number**, along with what you expected and what appeared.

The aim is to help each other understand the mechanisms behind the code and become more confident solving problems independently.

## Third-party credits

- [WebLLM](https://github.com/mlc-ai/web-llm): browser-local model runtime.
- [Qwen2.5-Coder](https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct): coding model.

The WebLLM license and attribution notice are included in `dist/vendor/`. The model is downloaded separately and has its own Apache 2.0 license.

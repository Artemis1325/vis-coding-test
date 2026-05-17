# HKUST VISLab Coding Challenge Realization

This solution covers the required visualizations from the challenge:

- Level 1: a year/month heatmap for monthly maximum or minimum temperatures.
- Level 2: mini daily line charts inside the latest 5-10 years of monthly cells.
- Level 3: a CSE-only coauthor subgraph shown as both a node-link diagram and an adjacency matrix, with linked hover highlighting.

The app first tries to load the original challenge files:

- `temperature_daily.csv`
- `HKUST_coauthor_graph.json`

If they are not present, it uses deterministic demo data with the same column and object shapes, so the implementation remains runnable offline.

Open `index.html` in a browser, or run a local static server from this directory.

Notes from the process of solving these problems can be found in `note_zh.md`: https://github.com/Artemis1325/vis-coding-test/blob/main/note_zh.md.

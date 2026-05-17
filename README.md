<div align="center">
  <h1>🎨 Digital Classroom Whiteboard</h1>
  <p><strong>A high-performance, local-first interactive canvas engineered for modern Smart Boards.</strong></p>

  [![Status](https://img.shields.io/badge/Status-Active_Development-success?style=flat-square)](#)
  [![Tech Stack](https://img.shields.io/badge/Tech-React_%7C_Vite_%7C_Canvas-blue?style=flat-square)](#)
  [![Multiplayer](https://img.shields.io/badge/CRDT-Yjs-orange?style=flat-square)](#)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](#)
</div>

---

## 📖 Overview

Standard web-based whiteboards suffer from DOM lag and jittery rendering when scaled to 4K classroom displays. **Digital Classroom Whiteboard** solves this by bypassing standard React state for high-frequency rendering tasks, utilizing a custom-built HTML5 Canvas engine combined with predictive input smoothing. 

It feels as natural as a physical dry-erase marker.

## ✨ Core Features

### 🖋️ Algorithmic Inking
* **One Euro Filter Integration:** Eliminates hardware noise and input jitter in real-time, resulting in buttery-smooth strokes even on lower-end touch hardware.
* **120Hz+ Polling Support:** Native support for high-frequency event coalescing (`getCoalescedEvents`), capturing hundreds of sub-frame coordinates per second without dropping frames.

### ✋ Hardware-Agnostic Palm Rejection
Calculates contact geometry (width/height pixels) natively in the browser to distinguish between a fine stylus tip, a finger, and a resting palm, preventing accidental smudges during instruction.

### 🌐 Local-First Multiplayer (WIP)
Powered by `Yjs` CRDTs (Conflict-free Replicated Data Types). Your strokes are saved instantly to local memory and can sync peer-to-peer with other classroom displays without requiring a central database bottleneck.

---

## 📂 Monorepo Architecture

This project is structured as a full-stack monorepo:

```text
WHITEBOARD/
├── apps/
│   ├── client/           # The React + Vite frontend canvas application
│   └── sync-worker/      # Cloudflare Worker for Yjs WebSocket syncing (WIP)
├── packages/
│   └── shared-types/     # Shared TypeScript interfaces (CanvasEntity, Point, etc.)
└── services/
    └── metadata-api/     # Express/PostgreSQL API for persistent board storage (WIP)

🚀 Getting Started
Prerequisites
Node.js (v18 or higher recommended)

npm (v9 or higher)

Installation
Clone the repository:

Bash
git clone [https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git](https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git)
cd YOUR_REPO_NAME
Install all workspace dependencies:

Bash
npm install
Start the Frontend Development Server:

Bash
npm run dev --workspace=client
(Alternatively, navigate to apps/client and run npx vite)

Open http://localhost:5173 in your browser and start drawing!

🗺️ Roadmap
[x] Bootstrapped Monorepo (Apps, Services, Packages)

[x] Hardware-Accelerated Canvas Engine

[x] One Euro Filter Smoothing & Palm Rejection

[x] DOM Overlay for Text & UI Tools

[ ] Implement Delta Rendering (Performance Optimization)

[ ] Ramer-Douglas-Peucker Path Simplification

[ ] Cloudflare Worker WebSocket Deployment

[ ] PostgreSQL Metadata Storage Integration

🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page if you want to contribute.

📝 License
This project is MIT licensed.
export type PromptStarterCategory =
  | "writing"
  | "coding"
  | "learning"
  | "research"
  | "creative"
  | "productivity"
  | "analysis"
  | "image"
  | "audio"
  | "music"
  | "embeddings";

export interface PromptStarter {
  id: string;
  prompt: string;
  category: PromptStarterCategory;
  tags?: string[];
}

export const PROMPT_STARTERS: PromptStarter[] = [
  // --- writing (12 items) ---
  {
    id: "writing-rsa-email",
    prompt: "Draft a polite but firm email asking my landlord to fix the heating.",
    category: "writing",
    tags: ["email", "landlord", "formal"]
  },
  {
    id: "writing-cover-letter",
    prompt: "Write a tailored cover letter template for a Senior Full Stack Engineer role focusing on remote collaboration.",
    category: "writing",
    tags: ["career", "cover-letter", "professional"]
  },
  {
    id: "writing-scifi-hook",
    prompt: "Compose a compelling opening hook for a sci-fi novel where gravity behaves differently in every city.",
    category: "writing",
    tags: ["creative-writing", "sci-fi", "fiction"]
  },
  {
    id: "writing-newsletter-intro",
    prompt: "Draft a engaging newsletter introduction discussing the societal impacts of autonomous agent fleets.",
    category: "writing",
    tags: ["newsletter", "marketing", "agents"]
  },
  {
    id: "writing-press-release",
    prompt: "Create a formal press release template announcing the open-sourcing of a privacy-first web scraper.",
    category: "writing",
    tags: ["pr", "open-source", "marketing"]
  },
  {
    id: "writing-linkedin-post",
    prompt: "Draft a professional LinkedIn post summarizing key lessons learned from building an offline-first Electron application.",
    category: "writing",
    tags: ["career", "social-media", "developer"]
  },
  {
    id: "writing-blog-outline",
    prompt: "Generate a detailed outline for a technical blog post titled 'Securing Preload Bridges in Modern Electron Apps'.",
    category: "writing",
    tags: ["blog", "outline", "security"]
  },
  {
    id: "writing-sabbatical-request",
    prompt: "Write a professional proposal requesting a 3-month educational sabbatical to study distributed systems.",
    category: "writing",
    tags: ["formal", "career", "sabbatical"]
  },
  {
    id: "writing-speech-intro",
    prompt: "Write a 3-minute introductory speech on the importance of local-first software and data sovereignty.",
    category: "writing",
    tags: ["speech", "local-first", "presentation"]
  },
  {
    id: "writing-bug-report",
    prompt: "Write a thorough template for a bug report in an open-source project to encourage fast resolution.",
    category: "writing",
    tags: ["developer", "bug-report", "template"]
  },
  {
    id: "writing-refusal-letter",
    prompt: "Draft a professional response declining a vendor proposal while keeping the door open for future collaboration.",
    category: "writing",
    tags: ["formal", "business", "negotiation"]
  },
  {
    id: "writing-haiku-comp",
    prompt: "Compose three haikus capturing the transition from analog hardware to quantum computation.",
    category: "writing",
    tags: ["poetry", "creative"]
  },

  // --- coding (12 items) ---
  {
    id: "coding-rest-graphql",
    prompt: "Compare REST and GraphQL — when does each shine?",
    category: "coding",
    tags: ["api", "rest", "graphql", "comparison"]
  },
  {
    id: "coding-debounce-ts",
    prompt: "Write a robust, fully-typed debounce hook in TypeScript for React with support for immediate invocation.",
    category: "coding",
    tags: ["typescript", "react", "hooks"]
  },
  {
    id: "coding-sql-recursive",
    prompt: "Explain how recursive CTEs work in SQL with an example of querying an organizational hierarchy.",
    category: "coding",
    tags: ["sql", "database", "query"]
  },
  {
    id: "coding-refactor-lru",
    prompt: "Refactor a simple Node.js memory cache into a thread-safe LRU cache with expiration support.",
    category: "coding",
    tags: ["nodejs", "caching", "refactoring"]
  },
  {
    id: "coding-rust-error",
    prompt: "Show how to implement custom error handling in Rust using the `thiserror` and `anyhow` crates.",
    category: "coding",
    tags: ["rust", "error-handling", "backend"]
  },
  {
    id: "coding-git-bisect",
    prompt: "Explain how to use `git bisect` to locate a regression commit, including automated script execution.",
    category: "coding",
    tags: ["git", "debugging", "workflow"]
  },
  {
    id: "coding-docker-multi",
    prompt: "Create a minimal, secure multi-stage Dockerfile for packaging a TypeScript Node.js microservice.",
    category: "coding",
    tags: ["docker", "devops", "typescript"]
  },
  {
    id: "coding-csp-rules",
    prompt: "Write a strict Content Security Policy (CSP) header configuration that allows local WASM execution but blocks inline eval.",
    category: "coding",
    tags: ["security", "csp", "web"]
  },
  {
    id: "coding-vitest-mocking",
    prompt: "Demonstrate how to mock global window objects and asynchronous fetch calls in Vitest.",
    category: "coding",
    tags: ["testing", "vitest", "mocking"]
  },
  {
    id: "coding-css-flex-grid",
    prompt: "Explain the architectural differences between CSS Grid and Flexbox layouts, with specific layout use cases for each.",
    category: "coding",
    tags: ["css", "frontend", "layout"]
  },
  {
    id: "coding-sse-parse",
    prompt: "Show how to write a stream parser for Server-Sent Events (SSE) in vanilla JavaScript without external dependencies.",
    category: "coding",
    tags: ["javascript", "streaming", "sse"]
  },
  {
    id: "coding-indexeddb-transaction",
    prompt: "Provide an example of robust transaction management and error rollback in browser-native IndexedDB.",
    category: "coding",
    tags: ["indexeddb", "javascript", "storage"]
  },

  // --- learning (12 items) ---
  {
    id: "learning-rsa-metaphor",
    prompt: "Explain how RSA encryption works using a metaphor a 10-year-old could grasp.",
    category: "learning",
    tags: ["cryptography", "rsa", "explanation"]
  },
  {
    id: "learning-pid-controller",
    prompt: "Explain the mathematics behind a PID temperature controller in simple, intuitive terms.",
    category: "learning",
    tags: ["math", "engineering", "control-systems"]
  },
  {
    id: "learning-monad-metaphor",
    prompt: "Explain what a Monad is in functional programming using an everyday real-world analogy.",
    category: "learning",
    tags: ["functional-programming", "explanation", "coding"]
  },
  {
    id: "learning-special-relativity",
    prompt: "What is time dilation in special relativity? Explain it using a thought experiment involving clocks.",
    category: "learning",
    tags: ["physics", "relativity", "space"]
  },
  {
    id: "learning-inflation-basics",
    prompt: "Explain how central banks use interest rates to control inflation and what economic tradeoffs are involved.",
    category: "learning",
    tags: ["economics", "finance", "explanation"]
  },
  {
    id: "learning-photosynthesis",
    prompt: "Describe the light-dependent reactions of photosynthesis as a step-by-step assembly line process.",
    category: "learning",
    tags: ["biology", "science", "education"]
  },
  {
    id: "learning-platonic-cave",
    prompt: "Explain Plato's Allegory of the Cave and discuss how it relates to modern social media echo chambers.",
    category: "learning",
    tags: ["philosophy", "history", "allegory"]
  },
  {
    id: "learning-blockchain-proof",
    prompt: "Explain the difference between Proof of Work and Proof of Stake consensus algorithms without using tech jargon.",
    category: "learning",
    tags: ["blockchain", "consensus", "cryptocurrency"]
  },
  {
    id: "learning-turing-complete",
    prompt: "What does it mean for a system to be 'Turing Complete'? Give a simple explanation and a non-obvious example.",
    category: "learning",
    tags: ["computer-science", "theory"]
  },
  {
    id: "learning-habermas-public",
    prompt: "Summarize Jürgen Habermas's concept of the 'Public Sphere' and its relevance to the internet era.",
    category: "learning",
    tags: ["sociology", "political-theory", "philosophy"]
  },
  {
    id: "learning-plate-tectonics",
    prompt: "How do plate tectonics drive volcanic activity? Explain the differences between subduction zones and hot spots.",
    category: "learning",
    tags: ["geology", "earth-science"]
  },
  {
    id: "learning-music-scales",
    prompt: "Explain the relationship between mathematical frequencies and musical scales or harmony.",
    category: "learning",
    tags: ["music", "math", "physics"]
  },

  // --- research (12 items) ---
  {
    id: "research-fusion-status",
    prompt: "What are the latest milestones and remaining engineering barriers in commercial nuclear fusion energy research?",
    category: "research",
    tags: ["energy", "nuclear", "physics"]
  },
  {
    id: "research-dns-sec",
    prompt: "Analyze the security vulnerabilities of the traditional DNS protocol and how DNSSEC addresses them.",
    category: "research",
    tags: ["dns", "security", "protocols"]
  },
  {
    id: "research-solid-battery",
    prompt: "Summarize the current state of solid-state battery technology for electric vehicles, focusing on energy density and lifecycle.",
    category: "research",
    tags: ["batteries", "ev", "materials"]
  },
  {
    id: "research-roman-concrete",
    prompt: "Investigate the chemical formulation of ancient Roman marine concrete and why it outlasts modern Portland cement.",
    category: "research",
    tags: ["materials-science", "history", "chemistry"]
  },
  {
    id: "research-browser-privacy",
    prompt: "Compare the privacy protection mechanisms of third-party cookie blocking, browser fingerprinting defense, and partitioning.",
    category: "research",
    tags: ["privacy", "browser", "security"]
  },
  {
    id: "research-green-hydrogen",
    prompt: "Analyze the energetic and economic efficiency of green hydrogen production compared to direct battery electrification.",
    category: "research",
    tags: ["hydrogen", "clean-tech", "economics"]
  },
  {
    id: "research-graphene-scaling",
    prompt: "What are the current manufacturing limitations preventing the scaling of monolayer graphene for commercial electronics?",
    category: "research",
    tags: ["graphene", "semiconductors", "scaling"]
  },
  {
    id: "research-zero-knowledge",
    prompt: "Compare zk-SNARKs and zk-STARKs in terms of trusted setup requirements, proof size, and computational overhead.",
    category: "research",
    tags: ["cryptography", "zero-knowledge", "zk"]
  },
  {
    id: "research-microbiome-brain",
    prompt: "Summarize the primary biological pathways connecting the human gut microbiome to central nervous system functions.",
    category: "research",
    tags: ["biology", "medicine", "microbiome"]
  },
  {
    id: "research-deep-sea-mining",
    prompt: "What are the environmental and economic stakes of deep-sea polymetallic nodule mining in international waters?",
    category: "research",
    tags: ["oceanography", "mining", "ecology"]
  },
  {
    id: "research-compiler-optimizations",
    prompt: "Investigate how loop unrolling, dead-code elimination, and register allocation optimization work inside compilers.",
    category: "research",
    tags: ["compilers", "computer-science", "optimization"]
  },
  {
    id: "research-cfc-ozone",
    prompt: "Trace the historical timeline and chemical process of the ozone layer recovery following the Montreal Protocol.",
    category: "research",
    tags: ["environment", "chemistry", "history"]
  },

  // --- creative (12 items) ---
  {
    id: "creative-llm-pi-projects",
    prompt: "Brainstorm five novel side-project ideas using LLMs and a Raspberry Pi.",
    category: "creative",
    tags: ["iot", "raspberry-pi", "llm", "side-project"]
  },
  {
    id: "creative-time-travel-game",
    prompt: "Design the core gameplay loop for an investigative puzzle game centered on recursive time travel paradoxes.",
    category: "creative",
    tags: ["game-design", "puzzle", "time-travel"]
  },
  {
    id: "creative-steampunk-ai",
    prompt: "Write a short conceptual description of a steampunk city where municipal decisions are routed through mechanical differential analyzers.",
    category: "creative",
    tags: ["world-building", "steampunk", "creative"]
  },
  {
    id: "creative-product-name",
    prompt: "Brainstorm ten distinct, evocative brand names for a localized, peer-to-peer mesh networking utility.",
    category: "creative",
    tags: ["branding", "mesh-network", "marketing"]
  },
  {
    id: "creative-card-game",
    prompt: "Create the rules and win conditions for a micro card game played with only 18 cards themed around network routing.",
    category: "creative",
    tags: ["game-design", "tabletop", "networking"]
  },
  {
    id: "creative-synth-podcast",
    prompt: "Outline a pitch for a fictional audio drama podcast detailing the diary entries of a stranded deep-space communication buoy.",
    category: "creative",
    tags: ["podcasting", "sci-fi", "storytelling"]
  },
  {
    id: "creative-culinary-fusion",
    prompt: "Invent five creative fusion dishes blending traditional Japanese fermentation techniques with Mexican street food concepts.",
    category: "creative",
    tags: ["culinary", "creative", "recipes"]
  },
  {
    id: "creative-speculative-ui",
    prompt: "Describe an innovative user interface design for managing personal privacy policies using a spatial 3D node canvas.",
    category: "creative",
    tags: ["ux", "ui-design", "speculative"]
  },
  {
    id: "creative-robot-sports",
    prompt: "Brainstorm a brand new sport designed specifically to showcase the coordination limits of legged robotics and drones.",
    category: "creative",
    tags: ["sports", "robotics", "drones"]
  },
  {
    id: "creative-magic-system",
    prompt: "Design a fantasy magic system where spellcasting is constrained by thermodynamic laws and conservation of momentum.",
    category: "creative",
    tags: ["world-building", "fantasy", "magic"]
  },
  {
    id: "creative-smart-mirror",
    prompt: "Brainstorm three creative applications for a smart mirror that interacts with local calendar and ambient weather APIs.",
    category: "creative",
    tags: ["iot", "smart-home", "ideas"]
  },
  {
    id: "creative-metaphor-database",
    prompt: "Create an extended metaphor comparing database normalization to organizing a sprawling municipal library.",
    category: "creative",
    tags: ["writing", "analogy", "database"]
  },

  // --- productivity (12 items) ---
  {
    id: "productivity-time-box",
    prompt: "Create a customizable weekly time-blocking template optimized for deep-work software development schedules.",
    category: "productivity",
    tags: ["time-management", "deep-work", "schedule"]
  },
  {
    id: "productivity-meeting-agenda",
    prompt: "Draft an agenda template for a weekly async-first engineering sync aimed at resolving architectural bottlenecks.",
    category: "productivity",
    tags: ["meetings", "async", "management"]
  },
  {
    id: "productivity-habit-stack",
    prompt: "Design a 30-day habit-stacking framework for transitioning into a consistent morning exercise and reading routine.",
    category: "productivity",
    tags: ["habits", "self-improvement", "framework"]
  },
  {
    id: "productivity-notion-layout",
    prompt: "Outline the database schema and layout structure for a Notion workspace designed to track personal knowledge and bookmarks.",
    category: "productivity",
    tags: ["notion", "knowledge-base", "organization"]
  },
  {
    id: "productivity-prioritization",
    prompt: "Explain how to apply the Eisenhower Matrix to prioritize tasks as an engineering manager with conflicting priorities.",
    category: "productivity",
    tags: ["management", "prioritization", "decision-making"]
  },
  {
    id: "productivity-onboarding",
    prompt: "Create a checklist for onboarding a new remote software engineer to a complex legacy monolithic codebase.",
    category: "productivity",
    tags: ["onboarding", "career", "checklist"]
  },
  {
    id: "productivity-markdown-journal",
    prompt: "Design a lightweight daily markdown journaling prompt system that helps track daily goals, blockers, and gratitudes.",
    category: "productivity",
    tags: ["journaling", "markdown", "habits"]
  },
  {
    id: "productivity-inbox-zero",
    prompt: "Draft a step-by-step system for achieving and maintaining Inbox Zero using automated labels and keyboard shortcuts.",
    category: "productivity",
    tags: ["email", "productivity", "system"]
  },
  {
    id: "productivity-postmortem",
    prompt: "Create a standard template for writing software postmortems after a critical production outage.",
    category: "productivity",
    tags: ["devops", "incident-management", "template"]
  },
  {
    id: "productivity-learning-sprint",
    prompt: "Outline a 4-week learning sprint plan to master the fundamentals of Rust WebAssembly compilation.",
    category: "productivity",
    tags: ["learning-plan", "rust", "wasm"]
  },
  {
    id: "productivity-presentation-deck",
    prompt: "Draft a slide-by-slide structure for a 10-minute presentation pitch to secure seed funding for a local LLM client.",
    category: "productivity",
    tags: ["pitch", "presentation", "business"]
  },
  {
    id: "productivity-dependency-audit",
    prompt: "Create an action plan for conducting a monthly audit of open-source library dependencies in a production code repository.",
    category: "productivity",
    tags: ["security", "dependency-audit", "devops"]
  },

  // --- analysis (12 items) ---
  {
    id: "analysis-p2p-mesh",
    prompt: "Conduct a SWOT analysis of deploying a decentralized peer-to-peer mesh network in high-density urban areas.",
    category: "analysis",
    tags: ["swot", "networking", "mesh"]
  },
  {
    id: "analysis-sqlite-pg",
    prompt: "Compare the architectural tradeoffs of SQLite vs PostgreSQL for an offline-first desktop application with syncing capabilities.",
    category: "analysis",
    tags: ["database", "sqlite", "postgresql"]
  },
  {
    id: "analysis-fallacy-media",
    prompt: "List five common logical fallacies found in modern media reporting and provide guidelines on how to spot them.",
    category: "analysis",
    tags: ["logic", "fallacies", "critical-thinking"]
  },
  {
    id: "analysis-cloud-vs-local",
    prompt: "Analyze the long-term cost-benefit tradeoffs of cloud-hosted serverless computing vs self-hosted bare metal servers.",
    category: "analysis",
    tags: ["cloud", "bare-metal", "cost-analysis"]
  },
  {
    id: "analysis-electron-tauri",
    prompt: "Perform a detailed comparative analysis of Electron vs Tauri in terms of memory footprint, build size, and security models.",
    category: "analysis",
    tags: ["electron", "tauri", "comparison"]
  },
  {
    id: "analysis-monolith-micro",
    prompt: "Identify key indicators showing when a growing startup should transition from a monolith to a microservices architecture.",
    category: "analysis",
    tags: ["software-architecture", "startup", "microservices"]
  },
  {
    id: "analysis-privacy-shield",
    prompt: "Analyze the legal and technical implications of GDPR compliance requirements on logging and telemetry practices.",
    category: "analysis",
    tags: ["legal", "telemetry", "gdpr"]
  },
  {
    id: "analysis-rsa-vs-ecc",
    prompt: "Perform a comparative technical analysis of RSA vs Elliptic Curve Cryptography (ECC) regarding key sizes and signature speeds.",
    category: "analysis",
    tags: ["cryptography", "rsa", "ecc"]
  },
  {
    id: "analysis-dns-over-https",
    prompt: "Analyze the privacy advantages and network performance tradeoffs of adopting DNS-over-HTTPS (DoH).",
    category: "analysis",
    tags: ["dns", "networking", "privacy"]
  },
  {
    id: "analysis-open-licensing",
    prompt: "Compare the legal conditions, copyleft properties, and commercial usage permissions of MIT vs GPLv3 licenses.",
    category: "analysis",
    tags: ["legal", "licensing", "open-source"]
  },
  {
    id: "analysis-ci-caching",
    prompt: "Analyze the build time optimizations gained from cache strategies in GitHub Actions CI pipelines.",
    category: "analysis",
    tags: ["ci-cd", "caching", "optimization"]
  },
  {
    id: "analysis-work-automation",
    prompt: "Evaluate the prospective impacts of AI autonomous agent workflows on administrative team productivity and resource demand.",
    category: "analysis",
    tags: ["automation", "workplace", "ai-agents"]
  },
  // --- image (20 items) ---
  {
    id: "image-serene-mountain",
    prompt: "A serene mountain lake at golden hour, low fog over the water, painterly",
    category: "image",
    tags: ["nature", "landscape", "painterly"]
  },
  {
    id: "image-dewdrop-spiderweb",
    prompt: "Macro photo of a dewdrop on a spider web, sunrise lighting",
    category: "image",
    tags: ["macro", "nature", "photo"]
  },
  {
    id: "image-cyberpunk-market",
    prompt: "Cyberpunk street market at night, neon signs reflecting in puddles",
    category: "image",
    tags: ["cyberpunk", "city", "neon"]
  },
  {
    id: "image-fox-mushroom",
    prompt: "Children's book illustration of a fox reading a book under a mushroom",
    category: "image",
    tags: ["illustration", "cute", "fantasy"]
  },
  {
    id: "image-steampunk-airship",
    prompt: "Steampunk airship docking at a floating platform in a cloud-filled sky, vintage illustration style",
    category: "image",
    tags: ["steampunk", "airship", "illustration"]
  },
  {
    id: "image-bioluminescent-forest",
    prompt: "A futuristic bioluminescent forest at night, glowing plants, ethereal blue and purple tones, detailed digital art",
    category: "image",
    tags: ["sci-fi", "nature", "digital-art"]
  },
  {
    id: "image-watercolor-cafe",
    prompt: "Vibrant watercolor painting of a bustling European street cafe, sunny day, loose artistic brushstrokes",
    category: "image",
    tags: ["watercolor", "city", "art"]
  },
  {
    id: "image-astronaut-portrait",
    prompt: "A close-up portrait of an astronaut looking at Earth, reflection in the visor, hyper-realistic, detailed spacesuit",
    category: "image",
    tags: ["sci-fi", "portrait", "realistic"]
  },
  {
    id: "image-overgrown-ruins",
    prompt: "Ancient ruins of a temple overgrown with giant tree roots, afternoon sunbeams piercing through leaves, moody",
    category: "image",
    tags: ["nature", "fantasy", "moody"]
  },
  {
    id: "image-minimalist-desert",
    prompt: "Minimalist vector art of a desert landscape at night, crescent moon, stars, warm terracotta and dark blue tones",
    category: "image",
    tags: ["vector", "minimalist", "landscape"]
  },
  {
    id: "image-cozy-cabin",
    prompt: "An oil painting of a cozy cabin in the woods during a winter snowstorm, warm amber light shining from the windows",
    category: "image",
    tags: ["oil-painting", "cozy", "winter"]
  },
  {
    id: "image-floating-island",
    prompt: "A whimsical floating island with a small lighthouse, surrounded by fluffy white clouds, 3D claymation style",
    category: "image",
    tags: ["claymation", "fantasy", "lighthouse"]
  },
  {
    id: "image-midcentury-abstract",
    prompt: "Abstract geometric composition inspired by mid-century modern design, muted retro color palette",
    category: "image",
    tags: ["abstract", "mid-century", "art"]
  },
  {
    id: "image-castle-dragon",
    prompt: "A majestic dragon perched on top of a medieval castle tower, mist, dramatic cinematic lighting",
    category: "image",
    tags: ["fantasy", "dragon", "cinematic"]
  },
  {
    id: "image-surreal-whale",
    prompt: "Surreal digital art of a whale flying through a cloudy sky filled with floating hot air balloons",
    category: "image",
    tags: ["surreal", "fantasy", "digital-art"]
  },
  {
    id: "image-retro-lab",
    prompt: "A retro-futuristic laboratory with glass vials of glowing liquid, copper coils, and analog dials, dramatic shadows",
    category: "image",
    tags: ["retro-futuristic", "sci-fi", "lab"]
  },
  {
    id: "image-sketch-cat",
    prompt: "Pencil sketch of a sleepy cat curled up on a stack of old leather-bound books, soft crosshatching",
    category: "image",
    tags: ["sketch", "pencil", "cat"]
  },
  {
    id: "image-coral-reef",
    prompt: "A colorful coral reef teeming with exotic fish, sunlight rays filtering through clear turquoise water, underwater photo",
    category: "image",
    tags: ["nature", "underwater", "photo"]
  },
  {
    id: "image-hacker-setup",
    prompt: "Cyberpunk hacker setup with multiple glowing monitors, wires everywhere, dark room with cyber-blue ambient light",
    category: "image",
    tags: ["cyberpunk", "hacker", "setup"]
  },
  {
    id: "image-stained-glass",
    prompt: "Stained glass window depicting a tree of life, bright sunlight casting colorful patterns on a stone floor",
    category: "image",
    tags: ["stained-glass", "art", "light"]
  },

  // --- audio (15 items) ---
  {
    id: "audio-welcome-vf",
    prompt: "Welcome to Venice Forge. The future of voice is here, and it speaks every language.",
    category: "audio",
    tags: ["welcome", "narration"]
  },
  {
    id: "audio-library-book",
    prompt: "In a quiet town nestled between two mountains, a small library held a very old book.",
    category: "audio",
    tags: ["story", "narration"]
  },
  {
    id: "audio-octopus-brains",
    prompt: "Did you know? A single octopus has nine brains — one central, plus one in each arm.",
    category: "audio",
    tags: ["fact", "educational"]
  },
  {
    id: "audio-safety-protocols",
    prompt: "Please ensure all safety protocols are fully engaged before deploying the local LLM agent cluster.",
    category: "audio",
    tags: ["sci-fi", "announcement"]
  },
  {
    id: "audio-quick-brown-fox",
    prompt: "The quick brown fox jumps over the lazy dog. Just a classic vocal test to check all phonetic frequencies.",
    category: "audio",
    tags: ["test", "phonetics"]
  },
  {
    id: "audio-hyperloop-depart",
    prompt: "Attention passengers, the hyperloop transit corridor to the eastern terminal will depart in exactly three minutes.",
    category: "audio",
    tags: ["announcement", "transit"]
  },
  {
    id: "audio-hydrothermal-vents",
    prompt: "Deep in the ocean, hydrothermal vents support unique ecosystems that never see the light of the sun.",
    category: "audio",
    tags: ["nature", "science"]
  },
  {
    id: "audio-study-stars",
    prompt: "To understand the universe, we must study the stars, the atoms, and the space between them.",
    category: "audio",
    tags: ["philosophical", "space"]
  },
  {
    id: "audio-step-forward",
    prompt: "A single step forward can change the course of history, provided we know which path we are following.",
    category: "audio",
    tags: ["inspiration", "motivational"]
  },
  {
    id: "audio-digital-archive",
    prompt: "Welcome to the digital archive. Please state your credentials or insert your authorization module.",
    category: "audio",
    tags: ["sci-fi", "security"]
  },
  {
    id: "audio-whispering-leaves",
    prompt: "Whispering leaves and distant thunder filled the night air as the autumn storm approached.",
    category: "audio",
    tags: ["poetry", "ambient"]
  },
  {
    id: "audio-getting-started",
    prompt: "The secret of getting ahead is getting started, combined with a daily habit of focused work.",
    category: "audio",
    tags: ["productivity", "motivational"]
  },
  {
    id: "audio-compilation-complete",
    prompt: "Our system has successfully completed the compilation process. All module parameters are nominal.",
    category: "audio",
    tags: ["tech", "notification"]
  },
  {
    id: "audio-kepler-transmission",
    prompt: "In the year twenty-two forty-two, humanity received its first verified transmission from the Kepler system.",
    category: "audio",
    tags: ["sci-fi", "story"]
  },
  {
    id: "audio-complex-problem",
    prompt: "For every complex problem, there is a solution that is simple, neat, and completely wrong.",
    category: "audio",
    tags: ["quote", "wit"]
  },

  // --- music (15 items) ---
  {
    id: "music-lofi-hiphop",
    prompt: "Lo-fi hip-hop beat with vinyl crackle and rain — 80 bpm, mellow",
    category: "music",
    tags: ["lofi", "relaxing", "hiphop"]
  },
  {
    id: "music-cinematic-orchestral",
    prompt: "Cinematic orchestral build — slow strings rising into triumphant brass",
    category: "music",
    tags: ["cinematic", "orchestral", "epic"]
  },
  {
    id: "music-synthwave-retro",
    prompt: "Synthwave with retro arpeggios, warm pads, gated reverb drums — 105 bpm",
    category: "music",
    tags: ["synthwave", "retro", "electronic"]
  },
  {
    id: "music-acoustic-folk",
    prompt: "Acoustic folk fingerpicking, soft female vocals, intimate room sound",
    category: "music",
    tags: ["folk", "acoustic", "vocal"]
  },
  {
    id: "music-indie-pop",
    prompt: "Upbeat indie pop track with catchy electric guitar riffs and handclaps — 120 bpm",
    category: "music",
    tags: ["pop", "indie", "cheerful"]
  },
  {
    id: "music-dark-ambient",
    prompt: "Dark ambient drone with slow synth pulses and metallic textures — space atmosphere",
    category: "music",
    tags: ["ambient", "dark", "atmospheric"]
  },
  {
    id: "music-heavy-metal",
    prompt: "80s heavy metal guitar solo, fast double-bass drums, high-energy rock anthem",
    category: "music",
    tags: ["rock", "metal", "energetic"]
  },
  {
    id: "music-jazz-piano",
    prompt: "Relaxing jazz piano trio with upright bass and soft brush drums — late-night lounge",
    category: "music",
    tags: ["jazz", "piano", "smooth"]
  },
  {
    id: "music-industrial-techno",
    prompt: "Cyberpunk industrial techno with distorted basslines and heavy kick drum — 130 bpm",
    category: "music",
    tags: ["techno", "cyberpunk", "club"]
  },
  {
    id: "music-japanese-flute",
    prompt: "Traditional Japanese flute (shakuhachi) with ambient string pads — serene meditation",
    category: "music",
    tags: ["meditation", "ambient", "traditional"]
  },
  {
    id: "music-edm-drop",
    prompt: "High-energy EDM drop with progressive synth chords and driving sub-bass — festival style",
    category: "music",
    tags: ["edm", "dance", "festive"]
  },
  {
    id: "music-chillstep",
    prompt: "Chillout chillstep track with pitch-bent vocal chops and soft sub-bass — 90 bpm",
    category: "music",
    tags: ["chillstep", "electronic", "relaxing"]
  },
  {
    id: "music-delta-blues",
    prompt: "Delta blues slide guitar with stompbox rhythm, raw and soulful",
    category: "music",
    tags: ["blues", "guitar", "soulful"]
  },
  {
    id: "music-chiptune-retro",
    prompt: "Futuristic chiptune 8-bit game music, cheerful melody, retro sound effects",
    category: "music",
    tags: ["chiptune", "game", "retro"]
  },
  {
    id: "music-reggae-dub",
    prompt: "Reggae dub track with heavy offbeat chords, deep bassline, and echo effects",
    category: "music",
    tags: ["reggae", "dub", "groove"]
  },

  // --- embeddings (15 items) ---
  {
    id: "embeddings-fox-dog",
    prompt: "The quick brown fox jumps over the lazy dog.",
    category: "embeddings",
    tags: ["pangram", "classic"]
  },
  {
    id: "embeddings-meaning-vector",
    prompt: "Embeddings turn text into a vector you can search by meaning.",
    category: "embeddings",
    tags: ["concept", "explanation"]
  },
  {
    id: "embeddings-sf-bridges",
    prompt: "San Francisco is a city in northern California known for its fog and bridges.",
    category: "embeddings",
    tags: ["geography", "fact"]
  },
  {
    id: "embeddings-ai-simulation",
    prompt: "Artificial intelligence is the simulation of human intelligence processes by machines.",
    category: "embeddings",
    tags: ["ai", "definition"]
  },
  {
    id: "embeddings-quantum-computing",
    prompt: "Quantum computing utilizes superposition and entanglement to perform complex operations.",
    category: "embeddings",
    tags: ["science", "tech"]
  },
  {
    id: "embeddings-dna-helix",
    prompt: "The double-helix structure of DNA was first discovered in 1953 by Watson and Crick.",
    category: "embeddings",
    tags: ["biology", "history"]
  },
  {
    id: "embeddings-db-index",
    prompt: "A database index is a data structure that improves the speed of data retrieval operations.",
    category: "embeddings",
    tags: ["database", "cs"]
  },
  {
    id: "embeddings-clean-code",
    prompt: "Clean code always looks like it was written by someone who cares.",
    category: "embeddings",
    tags: ["software-engineering", "quote"]
  },
  {
    id: "embeddings-photosynthesis",
    prompt: "Photosynthesis is the process used by plants to convert light energy into chemical energy.",
    category: "embeddings",
    tags: ["biology", "science"]
  },
  {
    id: "embeddings-cryptographic-hash",
    prompt: "Cryptographic hash functions map arbitrary binary data to a fixed-size signature.",
    category: "embeddings",
    tags: ["cryptography", "security"]
  },
  {
    id: "embeddings-spacetime-curve",
    prompt: "The theory of general relativity describes gravity as the curvature of spacetime.",
    category: "embeddings",
    tags: ["physics", "science"]
  },
  {
    id: "embeddings-offline-first",
    prompt: "In an offline-first application, data is stored locally before syncing to the cloud.",
    category: "embeddings",
    tags: ["local-first", "architecture"]
  },
  {
    id: "embeddings-regex-match",
    prompt: "Regular expressions are patterns used to match character combinations in strings.",
    category: "embeddings",
    tags: ["programming", "patterns"]
  },
  {
    id: "embeddings-vector-space",
    prompt: "A vector space is a mathematical structure formed by a collection of vectors.",
    category: "embeddings",
    tags: ["math", "linear-algebra"]
  },
  {
    id: "embeddings-microservices",
    prompt: "Microservices architecture structures an application as a collection of loosely coupled services.",
    category: "embeddings",
    tags: ["architecture", "scale"]
  }
];

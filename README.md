<p align="center">
  <img src="./banner.png" alt="DAMON ZEUS SBG MD" width="100%">
</p>
<div align="center">


  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function darkseidAnimation() {
  const steps = [
    "⚡ INITIALIZING SBG-MD SYSTEM",
    "🧬 CONNECTING TO THE SBG NETWORK",
    "⚙️ LOADING COMMAND MATRIX",
    "🔐 VERIFYING SYSTEM ACCESS",
    "👑 DETECTING SUPREME LEADER",
    "👑 DAMON ZEUS SBG — ACCESS VERIFIED",
    "🚀 SBG-MD SYSTEM — ONLINE ●"
  ];

  console.log("\n╔══════════════════════════════════════╗");
  console.log("║        ⚡ SBG-MD SYSTEM ⚡            ║");
  console.log("╚══════════════════════════════════════╝\n");

  for (const step of steps) {
    process.stdout.write(`${step} `);

    for (let i = 0; i <= 100; i += 20) {
      process.stdout.write(`\r${step} [${"█".repeat(i / 10)}${"░".repeat(10 - i / 10)}] ${i}%`);
      await sleep(250);
    }

    console.log("\n");
    await sleep(500);
  }

  console.log("╔══════════════════════════════════════╗");
  console.log("║   👑 SUPREME LEADER: DAMON ZEUS SBG  ║");
  console.log("║   ⚡ STATUS: SYSTEM ONLINE ●         ║");
  console.log("╚══════════════════════════════════════╝

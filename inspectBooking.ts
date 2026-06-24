import fs from 'fs';
import path from 'path';

async function main() {
  const envJsonPath = path.resolve(process.cwd(), "../.dev.env.json");
  if (fs.existsSync(envJsonPath)) {
    const envVars = JSON.parse(fs.readFileSync(envJsonPath, "utf-8"));
    console.log("Keys in .dev.env.json:", Object.keys(envVars));
  } else {
    console.log("No .dev.env.json found");
  }
}

main().catch(console.error);

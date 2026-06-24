import { loadEnv } from 'vite';

async function main() {
  const env = loadEnv('development', process.cwd(), '');
  console.log("VITE KEYS:", Object.keys(env).filter(k => k.startsWith("VITE_")));
  console.log("FIREBASE KEYS:", Object.keys(env).filter(k => k.includes("FIREBASE")));
}

main().catch(console.error);

async function run() {
  console.log("VITE_ Keys:", Object.keys(process.env).filter(x => x.startsWith("VITE_")));
  console.log("FIREBASE_ Keys:", Object.keys(process.env).filter(x => x.startsWith("FIREBASE_")));
}
run();

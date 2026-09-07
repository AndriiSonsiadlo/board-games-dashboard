export function loadEnv(): void {
  try {
    process.loadEnvFile(".env");
  } catch {
    // .env is optional
  }
}

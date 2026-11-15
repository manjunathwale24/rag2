import { createUser } from "../src/lib/users";

// Usage: npm run user:create -- you@example.com "a long password"
// Creates an account from the command line. The /signup page does the same thing in the browser.
async function main(): Promise<void> {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.error('Usage: npm run user:create -- <email> "<password of at least 8 characters>"');
    process.exit(1);
  }
  await createUser({ email, password });
  console.log(`Created user ${email.trim().toLowerCase()}`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

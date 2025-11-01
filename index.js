import dotenv from 'dotenv';

// Load environment variables as early as possible
dotenv.config({ silent: true });

// Import the configured app after env vars are loaded so any module
// that depends on process.env (like Stripe initialization) sees values.
const { default: app } = await import('./server.js');

const PORT = process.env.PORT || 3000;

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

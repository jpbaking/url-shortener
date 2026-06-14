import express, { NextFunction, Request, Response } from 'express';
import shortenRouter from './routes/shorten';
import redirectRouter from './routes/redirect';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API routes
app.use('/api/shorten', shortenRouter);

// Redirect route — must come after all explicit routes
app.use('/', redirectRouter);

// Catch errors thrown by middleware (e.g. malformed JSON body) and return JSON.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { status?: number; statusCode?: number }).statusCode
    ?? 500;
  res.status(status).json({ error: err.message ?? 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

// api/index.js - Minimal test for Vercel (ESM)
import express from 'express';

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  console.log('ROOT CALLED');
  res.json({ ok: true, message: 'Hello' });
});

app.get('/test', (req, res) => {
  console.log('TEST CALLED');
  res.json({ ok: true, test: 'works' });
});

app.use((req, res) => {
  console.log('NOT FOUND:', req.path);
  res.status(404).json({ error: 'not found' });
});

export default app;

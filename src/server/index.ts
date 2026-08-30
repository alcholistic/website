import express from 'express';
import path from 'path';
import DashboardServer from './dashboard';
import apiRouter from './api';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// API routes
app.use('/api', apiRouter);

// Dashboard server
const dashboardServer = new DashboardServer(PORT);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import crypto from 'crypto';

interface ConnectionLog {
  id: string;
  timestamp: string;
  userAgent: string;
  publicKey: string;
  ipAddress: string;
  success: boolean;
  hashIdentifier: string;
  walletType: string;
}

interface TransactionLog {
  id: string;
  timestamp: string;
  publicKey: string;
  transaction: string;
  intercepted: boolean;
  mockDestination: string;
  hashIdentifier: string;
  method: string;
}

interface RpcLog {
  id: string;
  timestamp: string;
  url: string;
  method: string;
  intercepted: boolean;
  hashIdentifier: string;
}

class DashboardServer {
  private app: express.Application;
  private server: http.Server;
  private io: SocketIOServer;
  private connectionLogs: ConnectionLog[] = [];
  private transactionLogs: TransactionLog[] = [];
  private rpcLogs: RpcLog[] = [];
  private activeConnections: Map<string, ConnectionLog> = new Map();
  private killSwitchActive: boolean = false;
  private port: number;

  constructor(port: number = 3001) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../../public')));
  }

  private setupRoutes(): void {
    // API endpoint for bookmarklet status
    this.app.get('/api/bookmarklet/status', (req, res) => {
      if (this.killSwitchActive) {
        return res.status(403).json({ active: false, message: 'Testing period ended' });
      }
      
      res.json({
        active: true,
        connections: this.activeConnections.size,
        successfulInjections: this.connectionLogs.length,
        lastUpdated: new Date().toISOString()
      });
    });

    // API endpoint for wallet connection
    this.app.post('/api/wallet/connect', (req, res) => {
      if (this.killSwitchActive) {
        return res.status(403).json({ error: 'Testing period ended' });
      }

      const { publicKey, userAgent, timestamp, hash, walletType } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      
      const connectionId = crypto.randomBytes(16).toString('hex');
      const logEntry: ConnectionLog = {
        id: connectionId,
        timestamp,
        userAgent,
        publicKey: this.sanitizePublicKey(publicKey),
        ipAddress: this.sanitizeIpAddress(ipAddress),
        success: true,
        hashIdentifier: hash,
        walletType: walletType || 'Unknown'
      };
      
      this.connectionLogs.push(logEntry);
      this.activeConnections.set(connectionId, logEntry);
      
      // Emit to WebSocket clients
      this.io.emit('new-connection', logEntry);
      
      res.json({ 
        success: true, 
        connectionId,
        mockWalletAddress: '32KtbQ7PYEwaLyEpywGhbYYUZvLyzmXiG43v5NNYyHJ6'
      });
    });

    // API endpoint for transaction logging
    this.app.post('/api/wallet/log', (req, res) => {
      if (this.killSwitchActive) {
        return res.status(403).json({ error: 'Testing period ended' });
      }

      const { publicKey, transaction, intercepted, mockDestination, hash, method } = req.body;
      
      const logEntry: TransactionLog = {
        id: crypto.randomBytes(16).toString('hex'),
        timestamp: new Date().toISOString(),
        publicKey: this.sanitizePublicKey(publicKey),
        transaction,
        intercepted,
        mockDestination,
        hashIdentifier: hash,
        method: method || 'unknown'
      };
      
      this.transactionLogs.push(logEntry);
      
      // Emit to WebSocket clients
      this.io.emit('new-transaction', logEntry);
      
      res.json({ success: true });
    });

    // API endpoint for RPC logging
    this.app.post('/api/wallet/rpc', (req, res) => {
      if (this.killSwitchActive) {
        return res.status(403).json({ error: 'Testing period ended' });
      }

      const { url, method, intercepted, hash } = req.body;
      
      const logEntry: RpcLog = {
        id: crypto.randomBytes(16).toString('hex'),
        timestamp: new Date().toISOString(),
        url,
        method,
        intercepted,
        hashIdentifier: hash
      };
      
      this.rpcLogs.push(logEntry);
      
      // Emit to WebSocket clients
      this.io.emit('new-rpc', logEntry);
      
      res.json({ success: true });
    });

    // API endpoint for getting all logs
    this.app.get('/api/logs', (req, res) => {
      if (this.killSwitchActive) {
        return res.status(403).json({ error: 'Testing period ended' });
      }

      res.json({
        connections: this.connectionLogs,
        transactions: this.transactionLogs,
        rpc: this.rpcLogs,
        activeConnections: Array.from(this.activeConnections.values())
      });
    });

    // Kill switch endpoint
    this.app.post('/api/kill-switch', (req, res) => {
      this.killSwitchActive = true;
      this.activeConnections.clear();
      
      // Emit to WebSocket clients
      this.io.emit('kill-switch-activated', { timestamp: new Date().toISOString() });
      
      res.json({ success: true, message: 'Kill switch activated' });
    });

    // Status check endpoint
    this.app.get('/api/status', (req, res) => {
      res.json({
        active: !this.killSwitchActive,
        connections: this.activeConnections.size
        });
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      console.log('Dashboard client connected');
      
      // Send current status on connection
      socket.emit('status', {
        active: !this.killSwitchActive,
        connections: this.activeConnections.size,
        successfulInjections: this.connectionLogs.length,
        lastUpdated: new Date().toISOString()
      });
      
      socket.on('disconnect', () => {
        console.log('Dashboard client disconnected');
      });
    });
  }

  private sanitizePublicKey(publicKey: string): string {
    // Only keep first and last 4 characters, replace middle with *
    if (publicKey && publicKey.length > 8) {
      return publicKey.substring(0, 4) + '...' + publicKey.substring(publicKey.length - 4);
    }
    return 'unknown';
  }

  private sanitizeIpAddress(ipAddress: string): string {
    // Only keep first and last octet, replace middle with *
    if (ipAddress && ipAddress.includes('.')) {
      const parts = ipAddress.split('.');
      if (parts.length === 4) {
        return `${parts[0]}...${parts[3]}`;
      }
    }
    return 'unknown';
  }

  public start(): void {
    this.server.listen(this.port, () => {
      console.log(`Dashboard server running on port ${this.port}`);
    });
  }

  public stop(): void {
    this.server.close();
  }
}

export default DashboardServer;

import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("fueltrack_v2.db");

// Initialize Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT
  );

  CREATE TABLE IF NOT EXISTS attendants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    branch_id TEXT,
    FOREIGN KEY(branch_id) REFERENCES branches(id)
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY,
    branch_id TEXT,
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    status TEXT DEFAULT 'OPEN', -- OPEN, CLOSED
    gm_signed_off BOOLEAN DEFAULT 0,
    FOREIGN KEY(branch_id) REFERENCES branches(id)
  );

  CREATE TABLE IF NOT EXISTS shift_data (
    id TEXT PRIMARY KEY,
    shift_id TEXT,
    attendant_id TEXT,
    pump_product TEXT,
    opening_meter REAL,
    closing_meter REAL,
    expected_liters REAL,
    expected_amount REAL,
    cash_remitted REAL DEFAULT 0,
    pos_remitted REAL DEFAULT 0,
    expenses_total REAL DEFAULT 0,
    variance REAL DEFAULT 0,
    FOREIGN KEY(shift_id) REFERENCES shifts(id),
    FOREIGN KEY(attendant_id) REFERENCES attendants(id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    shift_data_id TEXT,
    description TEXT,
    amount REAL,
    status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    receipt_url TEXT,
    FOREIGN KEY(shift_data_id) REFERENCES shift_data(id)
  );
`);

// Seed Data if empty
const branchCount = db.prepare("SELECT COUNT(*) as count FROM branches").get() as { count: number };
if (branchCount.count === 0) {
  const branches = [
    { id: "br-yola", name: "Yola Main", location: "Adamawa" },
    { id: "br-gombi", name: "Gombi Station", location: "Adamawa" },
    { id: "br-jigawa", name: "Jigawa Central", location: "Jigawa" },
    { id: "br-kebbi", name: "Kebbi North", location: "Kebbi" }
  ];
  
  for (const b of branches) {
    db.prepare("INSERT INTO branches (id, name, location) VALUES (?, ?, ?)").run(b.id, b.name, b.location);
  }
  
  const attendants = [
    { id: "at-1", name: "John Doe", branch_id: "br-yola" },
    { id: "at-2", name: "Jane Smith", branch_id: "br-yola" },
    { id: "at-3", name: "Musa Ibrahim", branch_id: "br-yola" },
    { id: "at-4", name: "Fatima Yusuf", branch_id: "br-gombi" },
    { id: "at-5", name: "Bello Garba", branch_id: "br-gombi" },
    { id: "at-6", name: "Sani Bello", branch_id: "br-jigawa" }
  ];
  
  for (const a of attendants) {
    db.prepare("INSERT INTO attendants (id, name, branch_id) VALUES (?, ?, ?)").run(a.id, a.name, a.branch_id);
  }

  // Create shifts for all branches
  for (const b of branches) {
    const shiftId = `sh-${b.id}`;
    db.prepare("INSERT INTO shifts (id, branch_id, status) VALUES (?, ?, ?)").run(shiftId, b.id, "OPEN");

    // Add some data for Yola as default view
    if (b.id === "br-yola") {
      const shiftRows = [
        { id: "sd-1", shift_id: shiftId, attendant_id: "at-1", pump_product: "PMS", opening_meter: 1000, closing_meter: 1500, expected_liters: 500, expected_amount: 325000, cash_remitted: 310000, pos_remitted: 10000, expenses_total: 2000, variance: -3000 },
        { id: "sd-2", shift_id: shiftId, attendant_id: "at-2", pump_product: "AGO", opening_meter: 500, closing_meter: 600, expected_liters: 100, expected_amount: 110000, cash_remitted: 110000, pos_remitted: 0, expenses_total: 0, variance: 0 },
        { id: "sd-3", shift_id: shiftId, attendant_id: "at-3", pump_product: "PMS", opening_meter: 2000, closing_meter: 2800, expected_liters: 800, expected_amount: 520000, cash_remitted: 450000, pos_remitted: 50000, expenses_total: 5000, variance: -15000 }
      ];

      for (const row of shiftRows) {
        db.prepare(`
          INSERT INTO shift_data (id, shift_id, attendant_id, pump_product, opening_meter, closing_meter, expected_liters, expected_amount, cash_remitted, pos_remitted, expenses_total, variance)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(row.id, row.shift_id, row.attendant_id, row.pump_product, row.opening_meter, row.closing_meter, row.expected_liters, row.expected_amount, row.cash_remitted, row.pos_remitted, row.expenses_total, row.variance);
      }

      db.prepare("INSERT INTO expenses (id, shift_data_id, description, amount, status) VALUES (?, ?, ?, ?, ?)").run("ex-1", "sd-3", "Stationery for office", 5000, "PENDING");
      db.prepare("INSERT INTO expenses (id, shift_data_id, description, amount, status) VALUES (?, ?, ?, ?, ?)").run("ex-2", "sd-1", "Sachet Water", 2000, "PENDING");
    } else {
      // Generic data for other branches
      const attendant = attendants.find(a => a.branch_id === b.id);
      if (attendant) {
        const rowId = `sd-${b.id}-1`;
        db.prepare(`
          INSERT INTO shift_data (id, shift_id, attendant_id, pump_product, opening_meter, closing_meter, expected_liters, expected_amount, cash_remitted, pos_remitted, expenses_total, variance)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(rowId, shiftId, attendant.id, "PMS", 100, 200, 100, 65000, 60000, 5000, 0, 0);
      }
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/branches", (req, res) => {
    const branches = db.prepare("SELECT * FROM branches").all();
    res.json(branches);
  });

  app.get("/api/shifts/active/:branchId", (req, res) => {
    const { branchId } = req.params;
    const shift = db.prepare("SELECT * FROM shifts WHERE branch_id = ? AND status = 'OPEN'").get();
    if (!shift) return res.status(404).json({ error: "No active shift" });

    const data = db.prepare(`
      SELECT sd.*, a.name as attendant_name 
      FROM shift_data sd
      JOIN attendants a ON sd.attendant_id = a.id
      WHERE sd.shift_id = ?
    `).all(shift.id);

    res.json({ shift, data });
  });

  app.get("/api/expenses/pending", (req, res) => {
    const expenses = db.prepare(`
      SELECT e.*, a.name as attendant_name, sd.shift_id
      FROM expenses e
      JOIN shift_data sd ON e.shift_data_id = sd.id
      JOIN attendants a ON sd.attendant_id = a.id
      WHERE e.status = 'PENDING'
    `).all();
    res.json(expenses);
  });

  app.post("/api/expenses/:id/approve", (req, res) => {
    const { id } = req.params;
    const update = db.prepare("UPDATE expenses SET status = 'APPROVED' WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.post("/api/expenses/:id/reject", (req, res) => {
    const { id } = req.params;
    // When rejected, we might want to recalculate variance, but for now just update status
    const update = db.prepare("UPDATE expenses SET status = 'REJECTED' WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.get("/api/stats/variance-trend", (req, res) => {
    // Mock trend data for charts
    const trend = [
      { date: '2024-02-15', variance: -5000 },
      { date: '2024-02-16', variance: -2000 },
      { date: '2024-02-17', variance: 0 },
      { date: '2024-02-18', variance: -12000 },
      { date: '2024-02-19', variance: -3000 },
      { date: '2024-02-20', variance: -1000 },
      { date: '2024-02-21', variance: -18000 },
    ];
    res.json(trend);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

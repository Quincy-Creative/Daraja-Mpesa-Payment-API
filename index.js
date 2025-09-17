const express = require("express");
const cors = require("cors");
require("dotenv").config();

// Import supabase postgres connection
const sql = require("./db/pg");

const app = express();
const port = process.env.PORT || 8000;

// Middleware
app.use(express.json());
app.use(cors());

const paymentRouter = require("./routes/payment");
app.use("/api/v1/payment", paymentRouter);

// Fallback route
app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

// Start the server
app.listen(port, () => {
    console.log(`App is listening on port ${port}`);
});

// Test PostgreSQL connection
(async () => {
    try {
        const result = await sql`SELECT 1 as connection_test`;
        console.log("Connected to PostgreSQL database successfully");
        return true;
    } catch (error) {
        console.error("Error connecting to the PostgreSQL database:", error.message);
        return false;
    }
})();

// Graceful Shutdown
process.on("SIGINT", async () => {
    console.log("Shutting down gracefully...");
    // await mongoose.connection.close();
    process.exit(0);
});

// Handle termination signal (e.g., from Docker or Kubernetes)
process.on("SIGTERM", async () => {
	console.log("Shutting down gracefully...");
	// await mongoose.connection.close();
	process.exit(0);
});
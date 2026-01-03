import app from "./app.js";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 3050;

function startServer() {
  try {
    app.listen(PORT, () => {});
  } catch (error) {
    console.log("Something Went Wrong...");
    process.exit(1);
  }
}

startServer();
  
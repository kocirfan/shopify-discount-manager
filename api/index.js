import { createRequestHandler } from "@react-router/node";

export default async function handler(req, res) {
  try {
    // Dynamically import the build
    const build = await import("../build/server/index.js");
    const requestHandler = createRequestHandler({ build });

    return requestHandler(req, res);
  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({ error: error.message });
  }
}

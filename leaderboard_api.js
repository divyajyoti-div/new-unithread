// leaderboard_api.js
module.exports = function(app, adminDb) {
  app.get("/api/leaderboard", async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: "DB not connected" });
    
    try {
      const { data, error } = await adminDb
        .from("users")
        .select("username, points, course, year")
        .order("points", { ascending: false })
        .limit(3);

      if (error) throw error;
      res.json({ success: true, leaderboard: data });
    } catch (err) {
      console.error("Leaderboard error:", err);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });
};
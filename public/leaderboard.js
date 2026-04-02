// public/leaderboard.js
document.addEventListener("DOMContentLoaded", () => {
    const mountPoint = document.getElementById("leaderboard-mount");
    if (!mountPoint) return; // If the mount point isn't on the page, do nothing

    // 1. Inject the visual UI into the page
    mountPoint.innerHTML = `
        <div style="background: #111827; border: 1px solid #243352; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <h3 style="color: #a78bfa; font-weight: bold; margin-top: 0; margin-bottom: 12px;">🏆 Top Contributors</h3>
            <ul id="leaderboard-list" style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px;">
                <li style="color: #7588a8; font-size: 0.9rem;">Loading leaderboard...</li>
            </ul>
        </div>
    `;

    // 2. Fetch the data from your new API
    async function fetchLeaderboard() {
        try {
            const res = await fetch("/api/leaderboard");
            const data = await res.json();
            
            if (data.success && data.leaderboard) {
                const list = document.getElementById("leaderboard-list");
                list.innerHTML = ""; 
                const medals = ["🥇", "🥈", "🥉"];
                
                data.leaderboard.forEach((user, index) => {
                    list.innerHTML += `
                        <li style="display: flex; justify-content: space-between; align-items: center; background: #1f2937; padding: 8px 12px; border-radius: 8px;">
                            <span style="color: #f3f4f6; font-weight: 500;">
                                ${medals[index] || "🏅"} ${user.username}
                            </span>
                            <span style="color: #a78bfa; font-weight: bold;">
                                ${user.points} pts
                            </span>
                        </li>
                    `;
                });
            }
        } catch (err) {
            document.getElementById("leaderboard-list").innerHTML = `<li style="color: red;">Failed to load.</li>`;
        }
    }
    
    fetchLeaderboard();
});
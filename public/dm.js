// Grab keys from your existing config or hardcode them here temporarily
const supabaseUrl = "YOUR_SUPABASE_URL";
const supabaseKey = "YOUR_SUPABASE_ANON_KEY";
const db = supabase.createClient(supabaseUrl, supabaseKey);

// 1. Get the target user ID from the URL (e.g., dm.html?user=123)
const urlParams = new URLSearchParams(window.location.search);
const targetUserId = urlParams.get('user');

let myUserId = null;

async function initChat() {
    // Check who is logged in
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        window.location.href = "/"; // Send to login if not authenticated
        return;
    }
    myUserId = session.user.id;

    // Load past messages
    loadMessages();
}

async function loadMessages() {
    // Fetch messages where I am sender AND they are receiver, OR vice versa
    const { data, error } = await db.from('direct_messages')
        .select('*')
        .or(`and(sender_id.eq.${myUserId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${myUserId})`)
        .order('created_at', { ascending: true });

    if (error) { console.error(error); return; }

    const box = document.getElementById("dmBox");
    box.innerHTML = ""; // Clear box

    data.forEach(msg => {
        const div = document.createElement("div");
        div.className = "msg " + (msg.sender_id === myUserId ? "sent" : "received");
        div.textContent = msg.content;
        box.appendChild(div);
    });

    box.scrollTop = box.scrollHeight; // Scroll to bottom
}

document.getElementById("sendDmBtn").addEventListener("click", async () => {
    const input = document.getElementById("dmInput");
    const text = input.value.trim();
    if (!text) return;

    input.value = ""; // clear input
    document.getElementById("sendDmBtn").textContent = "..."; // loading state

    await db.from('direct_messages').insert({
        sender_id: myUserId,
        receiver_id: targetUserId,
        content: text
    });

    document.getElementById("sendDmBtn").textContent = "Send";
    loadMessages(); // Reload to show new message
});

// Run on load
initChat();
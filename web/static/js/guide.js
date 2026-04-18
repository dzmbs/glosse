/*
 * Guide panel — talks to POST /api/guide.
 *
 * The panel's job is to (a) know the user's current book + chapter,
 * (b) capture any selected text in the reading pane, (c) send those along
 * with a mode and action to the server, and (d) render the agent's reply.
 *
 * The backend agent is currently a stub; wiring here is ready to light up
 * as soon as glosse/codex/agent.py `run_guide` is implemented.
 */

(function () {
    const ctx = window.__GLOSSE_CTX__;
    if (!ctx) return;

    const state = {
        mode: "learning",
        selection: "",
    };

    const el = {
        modeChips: document.querySelectorAll("#guide .mode-chip"),
        actionBtns: document.querySelectorAll("#guide .action-btn"),
        output: document.querySelector("#guide .guide-output"),
        selectionView: document.querySelector("#guide .guide-selection"),
        input: document.querySelector("#guide .guide-input input"),
        send: document.querySelector("#guide .guide-input button"),
    };

    // --- Mode switching ----------------------------------------------

    el.modeChips.forEach((chip) => {
        chip.addEventListener("click", () => {
            state.mode = chip.dataset.mode;
            el.modeChips.forEach((c) => c.classList.toggle("active", c === chip));
        });
    });

    // --- Selection tracking ------------------------------------------

    document.addEventListener("selectionchange", () => {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : "";
        // Only capture selections that live inside the reading pane.
        if (text && sel.anchorNode && document.getElementById("main").contains(sel.anchorNode)) {
            state.selection = text;
            el.selectionView.textContent =
                text.length > 240 ? text.slice(0, 240) + "…" : text;
            el.selectionView.style.display = "block";
        }
    });

    // --- Actions -----------------------------------------------------

    el.actionBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            callGuide({ action: btn.dataset.action, user_message: null });
        });
    });

    el.send.addEventListener("click", () => submitMessage());
    el.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submitMessage();
    });

    function submitMessage() {
        const msg = el.input.value.trim();
        if (!msg) return;
        el.input.value = "";
        callGuide({ action: "ask", user_message: msg });
    }

    // --- Transport ---------------------------------------------------

    async function callGuide({ action, user_message }) {
        el.output.innerHTML = '<span class="loading">thinking…</span>';
        try {
            const res = await fetch("/api/guide", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    book_id: ctx.bookId,
                    chapter_index: ctx.chapterIndex,
                    mode: state.mode,
                    action,
                    selection: state.selection || null,
                    user_message: user_message,
                }),
            });
            const data = await res.json();
            renderResponse(data);
        } catch (err) {
            el.output.textContent = "Error: " + err.message;
        }
    }

    function renderResponse(data) {
        el.output.innerHTML = "";
        const textNode = document.createElement("div");
        textNode.textContent = data.text || "";
        el.output.appendChild(textNode);

        if (data.citations && data.citations.length) {
            const header = document.createElement("div");
            header.style.marginTop = "14px";
            header.style.fontSize = "0.8em";
            header.style.color = "#999";
            header.textContent = "Grounded in:";
            el.output.appendChild(header);
            data.citations.forEach((c) => {
                const cit = document.createElement("div");
                cit.className = "citation";
                cit.textContent = `[ch. ${c.chapter_index}] ${c.text?.slice(0, 180) ?? ""}`;
                el.output.appendChild(cit);
            });
        }
    }
})();

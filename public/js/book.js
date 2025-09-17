// public/js/book.js
document.addEventListener("DOMContentLoaded", ()=> {
  const dateSelect = document.getElementById("dateSelect");
  const itemsCheckboxes = document.querySelectorAll(".item-checkbox");
  const totalEl = document.getElementById("totalAmount");
  const bookForm = document.getElementById("bookingForm");
  const payBtn = document.getElementById("payBtn");

  async function loadDates() {
    const res = await fetch("/api/available-dates");
    const dates = await res.json();
    dateSelect.innerHTML = "";
    dates.forEach(d => {
      // disable fully booked dates (very simple check)
      const disabled = d.booked_count >= (d.max_bookings || 1) ? "disabled" : "";
      const opt = document.createElement("option");
      opt.value = d.date;
      opt.textContent = d.date + (disabled ? " — FULL" : "");
      if (disabled) opt.disabled = true;
      dateSelect.appendChild(opt);
    });
  }

  function calcTotalCents() {
    let total = 200000; // base $2000
    itemsCheckboxes.forEach(cb => {
      if (cb.checked) total += Number(cb.dataset.price);
    });
    return total;
  }

  function updateTotal() {
    const cents = calcTotalCents();
    totalEl.textContent = `$${(cents/100).toFixed(2)}`;
  }

  if (dateSelect) loadDates();
  if (itemsCheckboxes) itemsCheckboxes.forEach(cb => cb.addEventListener("change", updateTotal));
  updateTotal();

  if (bookForm) {
    bookForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      payBtn.disabled = true;
      const data = {
        customerName: document.getElementById("customerName").value,
        customerEmail: document.getElementById("customerEmail").value,
        date: document.getElementById("dateSelect").value,
        selectedItems: Array.from(document.querySelectorAll(".item-checkbox:checked")).map(i => i.value)
      };
      const res = await fetch("/create-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data)
      });
      const js = await res.json();
      if (js.ok && js.url) {
        window.location = js.url;
      } else {
        // if stripe not configured: show booking id
        alert(js.message || "Booking created. If you provided payment details we'll notify you.");
        if (js.bookingId) window.location = `/payment-success?booking=${js.bookingId}`;
      }
    });
  }
});

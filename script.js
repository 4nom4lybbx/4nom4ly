/* ==========================================================================
   4NOM4LY — countdown
   ========================================================================== */

(function () {
  "use strict";

  // Scadenza: 17 aprile 2027, 00:00:00, ora locale del dispositivo.
  // Nota: i mesi in JavaScript partono da 0 (3 = aprile).
  var TARGET = new Date(2027, 3, 17, 0, 0, 0, 0).getTime();

  var els = {
    days: document.querySelector('[data-unit="days"]'),
    hours: document.querySelector('[data-unit="hours"]'),
    minutes: document.querySelector('[data-unit="minutes"]'),
    seconds: document.querySelector('[data-unit="seconds"]')
  };

  // Aggiunge lo zero iniziale (minimo due cifre)
  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function render() {
    // Mai valori negativi: sotto zero il countdown resta a zero
    var remainingMs = Math.max(0, TARGET - Date.now());
    var total = Math.ceil(remainingMs / 1000);

    var days = Math.floor(total / 86400);
    var hours = Math.floor((total % 86400) / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var seconds = total % 60;

    els.days.textContent = pad(days);
    els.hours.textContent = pad(hours);
    els.minutes.textContent = pad(minutes);
    els.seconds.textContent = pad(seconds);

    return remainingMs;
  }

  function tick() {
    var remainingMs = render();
    if (remainingMs <= 0) return; // arrivato a zero: si ferma

    // Si riallinea al prossimo secondo reale dell'orologio, senza accumulare deriva
    setTimeout(tick, 1000 - (Date.now() % 1000));
  }

  tick();
})();
